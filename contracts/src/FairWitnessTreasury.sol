// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IFairWitnessTypes as T} from "./interfaces/IFairWitnessTypes.sol";
import {FairWitnessHashing} from "./libraries/FairWitnessHashing.sol";
import {VerifiedMarketFactValidator} from "./VerifiedMarketFactValidator.sol";
import {PenguinV3Adapter} from "./PenguinV3Adapter.sol";

/// @notice Generic schema-v1 custody and universal-policy boundary.
/// @dev Strategy branches deliberately fail closed until Phases 4-6.
contract FairWitnessTreasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_ALLOWED_SLIPPAGE_BPS = 1_000;
    uint32 public constant MIN_EPOCH_LENGTH = 60;
    uint32 public constant MAX_EPOCH_LENGTH = 30 days;
    uint64 public constant MAX_PROPOSAL_HORIZON = 1 hours;
    uint16 public constant EXECUTION_RESERVE_BPS = 20;

    VerifiedMarketFactValidator public immutable FACT_VALIDATOR;
    PenguinV3Adapter public immutable DEX_ADAPTER;
    address public immutable WCTC;
    address public immutable STABLE;
    address public immutable VENUE;

    T.UniversalPolicy private _universal;
    T.ArbitragePolicy private _arbitrage;
    T.RebalancePolicy private _rebalance;
    T.RiskPolicy private _risk;
    T.AutomationMode public automationMode;
    uint64 public policyEpoch;

    mapping(address => bool) public registeredAgents;
    mapping(address => mapping(uint64 => bool)) public usedNonces;
    mapping(bytes32 => bool) public processedProposals;
    mapping(bytes32 => bool) public executedEvidence;
    mapping(uint256 => uint16) public attemptsInEpoch;
    mapping(uint256 => uint16) public executionsInEpoch;
    mapping(uint256 => uint128) public riskReductionUsedByDay;
    mapping(uint64 => T.AttemptRecord) private _attempts;
    uint64 public attemptCount;
    uint64 public executionCount;

    struct StrategyEvaluation {
        bool approved;
        T.ReasonCode reason;
        uint128 minimumOut;
        uint128 permittedValueE6;
        uint16 currentWctcBps;
        uint16 referenceBps;
        bytes32 evaluatedStateHash;
    }

    struct MarketEvaluation {
        T.ReasonCode reason;
        uint256 twap;
        uint256 spot;
        uint128 liquidity;
    }

    struct PortfolioEvaluation {
        uint256 wctcValueE6;
        uint256 stableValueE6;
        uint256 totalValueE6;
        uint256 wctcBps;
    }

    error InvalidConfiguration();
    error InvalidPolicy();
    error NotRegisteredAgent();
    error AttemptRateLimitExceeded();
    error CannotRenounceOwnership();
    error OnlySelf();
    error AssetNotAllowed();
    error AmountOutOverflow();

    event AgentRegistered(address indexed agent);
    event AgentDeregistered(address indexed agent);
    event AutomationModeChanged(
        T.AutomationMode oldMode, T.AutomationMode newMode, uint64 policyEpoch, bytes32 policyHash
    );
    event AttemptResolved(
        uint64 indexed attemptId,
        bytes32 indexed proposalId,
        address indexed agent,
        T.AttemptResult result,
        T.ReasonCode reason
    );
    event OwnerExit(address indexed asset, uint256 amount, address indexed recipient);

    constructor(
        address validator_,
        address adapter_,
        address owner_,
        T.UniversalPolicy memory universal_,
        T.ArbitragePolicy memory arbitrage_,
        T.RebalancePolicy memory rebalance_,
        T.RiskPolicy memory risk_
    ) Ownable(owner_) {
        if (
            validator_ == address(0) || adapter_ == address(0) || owner_ == address(0) || validator_.code.length == 0
                || adapter_.code.length == 0
        ) revert InvalidConfiguration();
        _validatePolicy(universal_, arbitrage_, rebalance_, risk_);
        PenguinV3Adapter adapter = PenguinV3Adapter(adapter_);
        FACT_VALIDATOR = VerifiedMarketFactValidator(validator_);
        DEX_ADAPTER = adapter;
        WCTC = adapter.WCTC();
        STABLE = adapter.STABLE();
        VENUE = adapter_;
        _universal = universal_;
        _arbitrage = arbitrage_;
        _rebalance = rebalance_;
        _risk = risk_;
        automationMode = T.AutomationMode.Paused;
    }

    function universalPolicy() external view returns (T.UniversalPolicy memory) {
        return _universal;
    }

    function arbitragePolicy() external view returns (T.ArbitragePolicy memory) {
        return _arbitrage;
    }

    function rebalancePolicy() external view returns (T.RebalancePolicy memory) {
        return _rebalance;
    }

    function riskPolicy() external view returns (T.RiskPolicy memory) {
        return _risk;
    }

    function currentPolicyHash() public view returns (bytes32) {
        T.PolicyHashInput memory input = T.PolicyHashInput({
            wctc: WCTC,
            stable: STABLE,
            venue: VENUE,
            universal: _universal,
            arbitrage: _arbitrage,
            rebalance: _rebalance,
            risk: _risk,
            automationMode: automationMode,
            policyEpoch: policyEpoch
        });
        return FairWitnessHashing.policyHash(block.chainid, address(this), input);
    }

    function registerAgent(address agent) external onlyOwner {
        if (agent == address(0)) revert InvalidConfiguration();
        registeredAgents[agent] = true;
        emit AgentRegistered(agent);
    }

    function deregisterAgent(address agent) external onlyOwner {
        registeredAgents[agent] = false;
        emit AgentDeregistered(agent);
    }

    function setAutomationMode(T.AutomationMode mode) external onlyOwner {
        if (mode == automationMode) return;
        T.AutomationMode oldMode = automationMode;
        automationMode = mode;
        policyEpoch++;
        emit AutomationModeChanged(oldMode, mode, policyEpoch, currentPolicyHash());
    }

    function renounceOwnership() public pure override {
        revert CannotRenounceOwnership();
    }

    function submitProposal(
        T.Proposal calldata proposal,
        VerifiedMarketFactValidator.ProofData calldata sourceProof,
        VerifiedMarketFactValidator.ProofData calldata confirmProof
    ) external nonReentrant returns (uint64 attemptId, T.ReasonCode reason) {
        if (!registeredAgents[msg.sender]) revert NotRegisteredAgent();
        uint256 epoch = block.timestamp / _universal.epochLength;
        if (attemptsInEpoch[epoch] >= _universal.maxAttemptsPerEpoch) revert AttemptRateLimitExceeded();
        attemptsInEpoch[epoch]++;
        attemptId = ++attemptCount;
        bytes32 proposalId = FairWitnessHashing.proposalId(block.chainid, address(this), proposal);
        bytes32 executionKey = FairWitnessHashing.executionKey(address(this), proposal);
        reason = _universalReason(proposal, proposalId, executionKey);
        if (reason == T.ReasonCode.None) {
            processedProposals[proposalId] = true;
            usedNonces[msg.sender][proposal.nonce] = true;
            StrategyEvaluation memory evaluation;
            T.EvidenceStatus evidenceStatus;
            VerifiedMarketFactValidator.VerifiedObservation memory source;
            VerifiedMarketFactValidator.VerifiedObservation memory confirmation;
            try this.verifyEvidence(sourceProof, confirmProof) returns (
                VerifiedMarketFactValidator.VerifiedObservation memory verifiedSource,
                VerifiedMarketFactValidator.VerifiedObservation memory verifiedConfirmation
            ) {
                source = verifiedSource;
                confirmation = verifiedConfirmation;
                evidenceStatus = T.EvidenceStatus.Verified;
                bytes32 derived = FairWitnessHashing.evidenceHash(
                    T.EvidenceHashInput({
                        sourceChainKey: sourceProof.chainKey,
                        sourceBlockHeight: source.blockHeight,
                        sourceTxIndex: source.transactionIndex,
                        confirmBlockHeight: confirmation.blockHeight,
                        confirmTxIndex: confirmation.transactionIndex,
                        immutableObserver: FACT_VALIDATOR.MARKET_OBSERVER(),
                        immutableSourcePool: FACT_VALIDATOR.SOURCE_POOL(),
                        sourcePriceE6: source.priceE6,
                        confirmPriceE6: confirmation.priceE6,
                        sourceMeanTick: source.arithmeticMeanTick,
                        confirmMeanTick: confirmation.arithmeticMeanTick,
                        sourceLiquidity: source.liquidity,
                        confirmLiquidity: confirmation.liquidity
                    })
                );
                if (derived != proposal.evidenceHash) evaluation.reason = T.ReasonCode.EvidenceHashMismatch;
                else evaluation = _evaluateStrategy(proposal, source, confirmation);
            } catch (bytes memory verifierError) {
                evidenceStatus = T.EvidenceStatus.Invalid;
                evaluation.reason =
                    _isStaleError(verifierError) ? T.ReasonCode.EvidenceStale : T.ReasonCode.InvalidEvidence;
            }
            reason = evaluation.reason;
            if (evaluation.approved) {
                _record(attemptId, proposal, proposalId, executionKey, T.ReasonCode.None);
                _populateEvidence(attemptId, sourceProof, confirmProof, evidenceStatus, evaluation);
                try this.executeApproved(proposal, evaluation.minimumOut, evaluation.permittedValueE6) returns (
                    uint256 amountOut
                ) {
                    T.AttemptRecord storage executed = _attempts[attemptId];
                    executed.result = T.AttemptResult.Executed;
                    executed.amountInActual = proposal.amountIn;
                    executed.amountOutActual = uint128(amountOut);
                    emit AttemptResolved(attemptId, proposalId, msg.sender, T.AttemptResult.Executed, T.ReasonCode.None);
                    return (attemptId, T.ReasonCode.None);
                } catch {
                    reason = T.ReasonCode.ExecutionReverted;
                    T.AttemptRecord storage failed = _attempts[attemptId];
                    failed.result = T.AttemptResult.ExecutionFailed;
                    failed.reason = reason;
                    emit AttemptResolved(attemptId, proposalId, msg.sender, T.AttemptResult.ExecutionFailed, reason);
                    return (attemptId, reason);
                }
            }
            _record(attemptId, proposal, proposalId, executionKey, reason);
            _populateEvidence(attemptId, sourceProof, confirmProof, evidenceStatus, evaluation);
            emit AttemptResolved(attemptId, proposalId, msg.sender, T.AttemptResult.Rejected, reason);
            return (attemptId, reason);
        }
        _record(attemptId, proposal, proposalId, executionKey, reason);
        emit AttemptResolved(attemptId, proposalId, msg.sender, T.AttemptResult.Rejected, reason);
    }

    function verifyEvidence(
        VerifiedMarketFactValidator.ProofData calldata sourceProof,
        VerifiedMarketFactValidator.ProofData calldata confirmProof
    )
        external
        returns (
            VerifiedMarketFactValidator.VerifiedObservation memory,
            VerifiedMarketFactValidator.VerifiedObservation memory
        )
    {
        if (msg.sender != address(this)) revert OnlySelf();
        return FACT_VALIDATOR.verifyPair(sourceProof, confirmProof);
    }

    function _evaluateStrategy(
        T.Proposal calldata proposal,
        VerifiedMarketFactValidator.VerifiedObservation memory source,
        VerifiedMarketFactValidator.VerifiedObservation memory confirmation
    ) internal view virtual returns (StrategyEvaluation memory evaluation) {
        if (proposal.strategy != T.StrategyType.Arbitrage) {
            if (proposal.strategy == T.StrategyType.Rebalance) {
                return _evaluateRebalance(proposal, source, confirmation);
            }
            return _evaluateRisk(proposal, source, confirmation);
        }
        return _evaluateArbitrage(proposal, source, confirmation);
    }

    function _evaluateRisk(
        T.Proposal calldata p,
        VerifiedMarketFactValidator.VerifiedObservation memory source,
        VerifiedMarketFactValidator.VerifiedObservation memory confirmation
    ) private view returns (StrategyEvaluation memory e) {
        MarketEvaluation memory market = _validatedMarket(source, confirmation);
        if (market.reason != T.ReasonCode.None) {
            e.reason = market.reason;
            return e;
        }
        PortfolioEvaluation memory portfolio = _portfolio(confirmation.priceE6);
        if (portfolio.totalValueE6 == 0) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        uint256 currentWctcBps = portfolio.wctcBps;
        e.currentWctcBps = uint16(currentWctcBps);
        e.referenceBps = _risk.maxWctcExposureBps;
        if (currentWctcBps <= _risk.maxWctcExposureBps) {
            e.reason = T.ReasonCode.RiskThresholdNotBreached;
            e.evaluatedStateHash = keccak256(abi.encode(portfolio));
            return e;
        }
        if (p.assetIn != WCTC || p.assetOut != STABLE) {
            e.reason = T.ReasonCode.WrongDirection;
            return e;
        }
        uint256 excessValueE6 = portfolio.wctcValueE6
            - Math.mulDiv(portfolio.totalValueE6, _risk.maxWctcExposureBps, BPS);
        uint256 usedToday = riskReductionUsedByDay[block.timestamp / 1 days];
        if (usedToday >= _risk.dailyRiskReductionValueE6) {
            e.reason = T.ReasonCode.DailyRiskLimit;
            e.evaluatedStateHash = keccak256(abi.encode(portfolio, excessValueE6, usedToday));
            return e;
        }
        uint256 remainingDaily = _risk.dailyRiskReductionValueE6 - usedToday;
        uint256 permittedValueE6 = excessValueE6;
        if (permittedValueE6 > _risk.maxRiskReductionValueE6) permittedValueE6 = _risk.maxRiskReductionValueE6;
        if (permittedValueE6 > remainingDaily) permittedValueE6 = remainingDaily;
        if (permittedValueE6 > _universal.maxActionValueE6) permittedValueE6 = _universal.maxActionValueE6;
        e.permittedValueE6 = uint128(permittedValueE6);
        e.evaluatedStateHash = keccak256(
            abi.encode(market, portfolio, excessValueE6, usedToday, remainingDaily, permittedValueE6)
        );
        uint256 expectedInput = Math.mulDiv(permittedValueE6, 1e18, confirmation.priceE6);
        if (expectedInput == 0) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        if (p.amountIn > expectedInput) {
            e.reason = T.ReasonCode.AmountExceedsPolicy;
            return e;
        }
        if (p.amountIn != expectedInput) {
            e.reason = T.ReasonCode.AmountMismatch;
            return e;
        }
        if (IERC20(WCTC).balanceOf(address(this)) < expectedInput) {
            e.reason = T.ReasonCode.InsufficientBalance;
            return e;
        }
        if (executionsInEpoch[block.timestamp / _universal.epochLength] >= _universal.maxExecutionsPerEpoch) {
            e.reason = T.ReasonCode.ExecutionRateLimit;
            return e;
        }
        uint256 expectedOut = Math.mulDiv(expectedInput, market.twap, 1e18);
        uint256 minimumOut = Math.mulDiv(expectedOut, BPS - p.maxSlippageBps, BPS);
        if (minimumOut == 0 || minimumOut > type(uint128).max) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        e.approved = true;
        e.reason = T.ReasonCode.None;
        e.minimumOut = uint128(minimumOut);
    }

    function _evaluateRebalance(
        T.Proposal calldata p,
        VerifiedMarketFactValidator.VerifiedObservation memory source,
        VerifiedMarketFactValidator.VerifiedObservation memory confirmation
    ) private view returns (StrategyEvaluation memory e) {
        MarketEvaluation memory market = _validatedMarket(source, confirmation);
        if (market.reason != T.ReasonCode.None) {
            e.reason = market.reason;
            return e;
        }
        uint256 twap = market.twap;
        uint256 spot = market.spot;
        uint128 liquidity = market.liquidity;

        PortfolioEvaluation memory portfolio = _portfolio(confirmation.priceE6);
        uint256 wctcValueE6 = portfolio.wctcValueE6;
        uint256 stableValueE6 = portfolio.stableValueE6;
        uint256 portfolioValueE6 = portfolio.totalValueE6;
        if (portfolioValueE6 == 0) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        uint256 currentWctcBps = portfolio.wctcBps;
        uint256 target = _rebalance.targetWctcBps;
        uint256 deviation = currentWctcBps > target ? currentWctcBps - target : target - currentWctcBps;
        e.currentWctcBps = uint16(currentWctcBps);
        e.referenceBps = _rebalance.targetWctcBps;
        uint256[9] memory basicState;
        basicState[0] = twap;
        basicState[1] = spot;
        basicState[2] = liquidity;
        basicState[3] = wctcValueE6;
        basicState[4] = stableValueE6;
        basicState[5] = portfolioValueE6;
        basicState[6] = currentWctcBps;
        basicState[7] = target;
        basicState[8] = deviation;
        e.evaluatedStateHash = keccak256(abi.encode(basicState));
        if (deviation <= _rebalance.toleranceBps) {
            e.reason = T.ReasonCode.RebalanceWithinTolerance;
            return e;
        }
        bool sell = currentWctcBps > target;
        if (
            (sell && (p.assetIn != WCTC || p.assetOut != STABLE))
                || (!sell && (p.assetIn != STABLE || p.assetOut != WCTC))
        ) {
            e.reason = T.ReasonCode.WrongDirection;
            return e;
        }
        uint256 targetValueE6 = Math.mulDiv(portfolioValueE6, target, BPS);
        uint256 requiredValueE6 =
            wctcValueE6 > targetValueE6 ? wctcValueE6 - targetValueE6 : targetValueE6 - wctcValueE6;
        uint256 permittedValueE6 = requiredValueE6;
        if (permittedValueE6 > _rebalance.maxRebalanceValueE6) permittedValueE6 = _rebalance.maxRebalanceValueE6;
        if (permittedValueE6 > _universal.maxActionValueE6) permittedValueE6 = _universal.maxActionValueE6;
        e.permittedValueE6 = uint128(permittedValueE6);
        e.evaluatedStateHash =
            keccak256(abi.encode(e.evaluatedStateHash, targetValueE6, requiredValueE6, permittedValueE6));
        uint256 expectedInput = sell ? Math.mulDiv(permittedValueE6, 1e18, confirmation.priceE6) : permittedValueE6;
        if (expectedInput == 0) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        if (p.amountIn > expectedInput) {
            e.reason = T.ReasonCode.AmountExceedsPolicy;
            return e;
        }
        if (p.amountIn != expectedInput) {
            e.reason = T.ReasonCode.AmountMismatch;
            return e;
        }
        if (IERC20(p.assetIn).balanceOf(address(this)) < expectedInput) {
            e.reason = T.ReasonCode.InsufficientBalance;
            return e;
        }
        if (executionsInEpoch[block.timestamp / _universal.epochLength] >= _universal.maxExecutionsPerEpoch) {
            e.reason = T.ReasonCode.ExecutionRateLimit;
            return e;
        }
        uint256 expectedOut = sell ? Math.mulDiv(expectedInput, twap, 1e18) : Math.mulDiv(expectedInput, 1e18, twap);
        uint256 minimumOut = Math.mulDiv(expectedOut, BPS - p.maxSlippageBps, BPS);
        if (minimumOut == 0 || minimumOut > type(uint128).max || permittedValueE6 > type(uint128).max) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        e.approved = true;
        e.reason = T.ReasonCode.None;
        e.minimumOut = uint128(minimumOut);
    }

    function _universalReason(T.Proposal calldata p, bytes32 proposalId, bytes32 executionKey)
        private
        view
        returns (T.ReasonCode)
    {
        if (p.schemaVersion != 1) return T.ReasonCode.UnsupportedSchema;
        if (p.evidenceHash == 0 || p.observationHash == 0 || p.decisionHash == 0 || p.policyHash == 0) {
            return T.ReasonCode.InvalidCommitment;
        }
        if (automationMode != T.AutomationMode.Autonomous) return T.ReasonCode.PolicyPaused;
        if ((_universal.enabledStrategies & (uint8(1) << uint8(p.strategy))) == 0) {
            return T.ReasonCode.StrategyDisabled;
        }
        if (p.action != T.ActionType.SwapExactIn) return T.ReasonCode.ActionNotAllowed;
        bool pair = (p.assetIn == WCTC && p.assetOut == STABLE) || (p.assetIn == STABLE && p.assetOut == WCTC);
        if (!pair) return T.ReasonCode.AssetNotAllowed;
        if (p.venue != VENUE) return T.ReasonCode.VenueNotAllowed;
        if (p.deadline < block.timestamp) return T.ReasonCode.ProposalExpired;
        if (p.deadline > block.timestamp + MAX_PROPOSAL_HORIZON) return T.ReasonCode.DeadlineTooFar;
        if (p.maxSlippageBps > _universal.maxSlippageBps) return T.ReasonCode.SlippageExceedsPolicy;
        if (p.policyHash != currentPolicyHash()) return T.ReasonCode.PolicyHashMismatch;
        if (processedProposals[proposalId]) return T.ReasonCode.ReplayProposal;
        if (usedNonces[msg.sender][p.nonce]) return T.ReasonCode.NonceAlreadyUsed;
        if (executedEvidence[executionKey]) return T.ReasonCode.EvidenceAlreadyExecuted;
        if (p.amountIn == 0) return T.ReasonCode.ZeroExecutableAmount;
        return T.ReasonCode.None;
    }

    function _evaluateArbitrage(
        T.Proposal calldata p,
        VerifiedMarketFactValidator.VerifiedObservation memory source,
        VerifiedMarketFactValidator.VerifiedObservation memory confirmation
    ) private view returns (StrategyEvaluation memory e) {
        MarketEvaluation memory market = _validatedMarket(source, confirmation);
        if (market.reason != T.ReasonCode.None) {
            e.reason = market.reason;
            return e;
        }
        uint256 twap = market.twap;
        uint256 spot = market.spot;
        uint128 liquidity = market.liquidity;
        bool sell = twap > confirmation.priceE6;
        if (twap == confirmation.priceE6) {
            e.reason = T.ReasonCode.ArbitrageEdgeTooLow;
            return e;
        }
        if (
            (sell && (p.assetIn != WCTC || p.assetOut != STABLE))
                || (!sell && (p.assetIn != STABLE || p.assetOut != WCTC))
        ) {
            e.reason = T.ReasonCode.WrongDirection;
            return e;
        }
        uint256 gross = sell
            ? Math.mulDiv(twap - confirmation.priceE6, BPS, confirmation.priceE6)
            : Math.mulDiv(confirmation.priceE6 - twap, BPS, twap);
        uint256 poolFeeBps = Math.ceilDiv(DEX_ADAPTER.POOL_FEE(), 100);
        uint256 costs = poolFeeBps + p.maxSlippageBps + EXECUTION_RESERVE_BPS;
        if (gross < costs + _arbitrage.minNetEdgeBps) {
            e.reason = T.ReasonCode.ArbitrageEdgeTooLow;
            return e;
        }
        uint256 net = gross - costs;
        uint256 valueCap = _arbitrage.maxArbitrageValueE6 < _universal.maxActionValueE6
            ? _arbitrage.maxArbitrageValueE6
            : _universal.maxActionValueE6;
        uint256 balanceValue = sell
            ? Math.mulDiv(IERC20(WCTC).balanceOf(address(this)), twap, 1e18)
            : IERC20(STABLE).balanceOf(address(this));
        if (balanceValue == 0) {
            e.reason = T.ReasonCode.InsufficientBalance;
            return e;
        }
        if (balanceValue < valueCap) valueCap = balanceValue;
        uint256 scaledValue = Math.mulDiv(valueCap, net, uint256(_arbitrage.minNetEdgeBps) * 4);
        if (scaledValue > valueCap) scaledValue = valueCap;
        uint256 expectedInput = sell ? Math.mulDiv(scaledValue, 1e18, twap) : scaledValue;
        if (expectedInput == 0) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        if (p.amountIn > expectedInput) {
            e.reason = T.ReasonCode.AmountExceedsPolicy;
            return e;
        }
        if (p.amountIn != expectedInput) {
            e.reason = T.ReasonCode.AmountMismatch;
            return e;
        }
        if (executionsInEpoch[block.timestamp / _universal.epochLength] >= _universal.maxExecutionsPerEpoch) {
            e.reason = T.ReasonCode.ExecutionRateLimit;
            return e;
        }
        uint256 expectedOut = sell ? Math.mulDiv(expectedInput, twap, 1e18) : Math.mulDiv(expectedInput, 1e18, twap);
        uint256 minimumOut = Math.mulDiv(expectedOut, BPS - p.maxSlippageBps, BPS);
        if (
            minimumOut == 0 || minimumOut > type(uint128).max || scaledValue > type(uint128).max
                || net > type(uint16).max
        ) {
            e.reason = T.ReasonCode.ZeroExecutableAmount;
            return e;
        }
        e = StrategyEvaluation({
            approved: true,
            reason: T.ReasonCode.None,
            minimumOut: uint128(minimumOut),
            permittedValueE6: uint128(scaledValue),
            currentWctcBps: 0,
            referenceBps: uint16(net),
            evaluatedStateHash: keccak256(
                abi.encode(source, confirmation, twap, spot, liquidity, gross, costs, scaledValue)
            )
        });
    }

    function _populateEvidence(
        uint64 id,
        VerifiedMarketFactValidator.ProofData calldata sourceProof,
        VerifiedMarketFactValidator.ProofData calldata confirmProof,
        T.EvidenceStatus status,
        StrategyEvaluation memory evaluation
    ) private {
        T.AttemptRecord storage a = _attempts[id];
        a.sourceChainKey = sourceProof.chainKey;
        a.sourceBlockHeight = sourceProof.blockHeight;
        a.sourceTxIndex = sourceProof.transactionIndex;
        a.confirmBlockHeight = confirmProof.blockHeight;
        a.confirmTxIndex = confirmProof.transactionIndex;
        a.evidenceStatus = status;
        a.permittedValueE6 = evaluation.permittedValueE6;
        a.currentWctcBps = evaluation.currentWctcBps;
        a.referenceBps = evaluation.referenceBps;
        a.evaluatedStateHash = evaluation.evaluatedStateHash;
    }

    function _bpsGap(uint256 a, uint256 b) private pure returns (uint256) {
        uint256 base = a < b ? a : b;
        if (base == 0) return type(uint256).max;
        return Math.mulDiv(a > b ? a - b : b - a, BPS, base);
    }

    function _portfolio(uint256 wctcPriceE6) private view returns (PortfolioEvaluation memory p) {
        p.wctcValueE6 = Math.mulDiv(IERC20(WCTC).balanceOf(address(this)), wctcPriceE6, 1e18);
        p.stableValueE6 = IERC20(STABLE).balanceOf(address(this));
        p.totalValueE6 = p.wctcValueE6 + p.stableValueE6;
        if (p.totalValueE6 != 0) p.wctcBps = Math.mulDiv(p.wctcValueE6, BPS, p.totalValueE6);
    }

    function _validatedMarket(
        VerifiedMarketFactValidator.VerifiedObservation memory source,
        VerifiedMarketFactValidator.VerifiedObservation memory confirmation
    ) private view returns (MarketEvaluation memory market) {
        if (source.priceE6 == 0 || confirmation.priceE6 == 0) {
            market.reason = T.ReasonCode.InvalidEvidence;
            return market;
        }
        if (_bpsGap(source.priceE6, confirmation.priceE6) > _universal.maxSourceDriftBps) {
            market.reason = T.ReasonCode.SourceDriftTooHigh;
            return market;
        }
        if (source.liquidity < _universal.minSourceLiquidity || confirmation.liquidity < _universal.minSourceLiquidity)
        {
            market.reason = T.ReasonCode.SourceLiquidityTooLow;
            return market;
        }
        try DEX_ADAPTER.marketState() returns (uint256 twap, int24, uint256 spot, uint128 liquidity) {
            market.twap = twap;
            market.spot = spot;
            market.liquidity = liquidity;
        } catch {
            market.reason = T.ReasonCode.DestinationMarketInvalid;
            return market;
        }
        if (market.twap == 0 || market.spot == 0) {
            market.reason = T.ReasonCode.DestinationMarketInvalid;
        } else if (market.liquidity < _universal.minDestinationLiquidity) {
            market.reason = T.ReasonCode.DestinationLiquidityTooLow;
        } else if (_bpsGap(market.twap, market.spot) > _universal.maxSpotTwapDeviationBps) {
            market.reason = T.ReasonCode.DestinationDeviationTooHigh;
        }
    }

    function _isStaleError(bytes memory data) private pure returns (bool) {
        if (data.length < 4) return false;
        bytes4 selector;
        assembly { selector := mload(add(data, 32)) }
        return selector == VerifiedMarketFactValidator.ProofTooOld.selector;
    }

    function _record(uint64 id, T.Proposal calldata p, bytes32 proposalId, bytes32 executionKey, T.ReasonCode reason)
        private
    {
        T.AttemptRecord storage a = _attempts[id];
        a.attemptId = id;
        a.nonce = p.nonce;
        a.submittedAt = uint64(block.timestamp);
        a.resolvedAt = uint64(block.timestamp);
        a.agent = msg.sender;
        a.assetIn = p.assetIn;
        a.assetOut = p.assetOut;
        a.venue = p.venue;
        a.strategy = p.strategy;
        a.action = p.action;
        a.result = T.AttemptResult.Rejected;
        a.evidenceStatus = T.EvidenceStatus.NotChecked;
        a.reason = reason;
        a.proposedAmountIn = p.amountIn;
        a.proposalId = proposalId;
        a.executionKey = executionKey;
        a.evidenceHash = p.evidenceHash;
        a.observationHash = p.observationHash;
        a.decisionHash = p.decisionHash;
        a.policyHash = p.policyHash;
    }

    function ownerExit(address asset, uint256 amount) external onlyOwner nonReentrant {
        if (asset != WCTC && asset != STABLE) revert AssetNotAllowed();
        IERC20(asset).safeTransfer(owner(), amount);
        emit OwnerExit(asset, amount, owner());
    }

    function getAttempt(uint64 id) external view returns (T.AttemptRecord memory) {
        return _attempts[id];
    }

    /// @dev Installed for the locked atomic pattern; unreachable from proposals until a strategy approves.
    function executeApproved(T.Proposal calldata p, uint128 amountOutMinimum, uint128 permittedValueE6)
        external
        returns (uint256 amountOut)
    {
        if (msg.sender != address(this)) revert OnlySelf();
        bytes32 key = FairWitnessHashing.executionKey(address(this), p);
        executedEvidence[key] = true;
        executionCount++;
        executionsInEpoch[block.timestamp / _universal.epochLength]++;
        if (p.strategy == T.StrategyType.RiskReduction) {
            riskReductionUsedByDay[block.timestamp / 1 days] += permittedValueE6;
        }
        IERC20 input = IERC20(p.assetIn);
        input.forceApprove(VENUE, p.amountIn);
        PenguinV3Adapter.TradeDirection direction = p.assetIn == WCTC
            ? PenguinV3Adapter.TradeDirection.SellWctcForStable
            : PenguinV3Adapter.TradeDirection.BuyWctcWithStable;
        amountOut = DEX_ADAPTER.swapExactInput(direction, p.amountIn, amountOutMinimum, p.deadline);
        if (amountOut > type(uint128).max) revert AmountOutOverflow();
        input.forceApprove(VENUE, 0);
    }

    function _validatePolicy(
        T.UniversalPolicy memory u,
        T.ArbitragePolicy memory a,
        T.RebalancePolicy memory r,
        T.RiskPolicy memory k
    ) private pure {
        if (
            u.enabledStrategies == 0 || (u.enabledStrategies & ~uint8(7)) != 0 || u.maxActionValueE6 == 0
                || u.maxSlippageBps > MAX_ALLOWED_SLIPPAGE_BPS || u.maxExecutionsPerEpoch == 0
                || u.maxAttemptsPerEpoch < u.maxExecutionsPerEpoch || u.epochLength < MIN_EPOCH_LENGTH
                || u.epochLength > MAX_EPOCH_LENGTH
        ) revert InvalidPolicy();
        if ((u.enabledStrategies & 1) != 0 && (a.minNetEdgeBps == 0 || a.maxArbitrageValueE6 == 0)) {
            revert InvalidPolicy();
        }
        if (
            (u.enabledStrategies & 2) != 0
                && (r.targetWctcBps > BPS || r.toleranceBps == 0 || r.maxRebalanceValueE6 == 0)
        ) revert InvalidPolicy();
        if (
            (u.enabledStrategies & 4) != 0
                && (k.maxWctcExposureBps > BPS || k.maxRiskReductionValueE6 == 0 || k.dailyRiskReductionValueE6 == 0)
        ) revert InvalidPolicy();
        if (
            (u.enabledStrategies & 6) == 6 && uint256(k.maxWctcExposureBps) <= uint256(r.targetWctcBps) + r.toleranceBps
        ) revert InvalidPolicy();
    }
}
