// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INativeChainInfo} from "./interfaces/INativeChainInfo.sol";
import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";
import {AttestedMarketEventDecoder} from "./libraries/AttestedMarketEventDecoder.sol";

/// @title VerifiedMarketFactValidator
/// @notice Immutable Attestcoin boundary for a pair of Ethereum market-observer facts.
/// @dev This contract neither holds funds nor authorizes a trade. A treasury can bind
///      an instance immutably and consume only facts that pass this complete boundary.
contract VerifiedMarketFactValidator {
    struct ProofData {
        uint64 chainKey;
        uint64 blockHeight;
        uint64 transactionIndex;
        bytes encodedTransaction;
        INativeQueryVerifier.MerkleProof merkleProof;
        INativeQueryVerifier.ContinuityProof continuityProof;
    }

    struct VerifiedObservation {
        uint64 blockHeight;
        uint64 transactionIndex;
        address reporter;
        int24 arithmeticMeanTick;
        uint160 spotSqrtPriceX96;
        uint128 liquidity;
        uint256 priceE6;
    }

    INativeQueryVerifier public immutable BLOCK_PROVER;
    INativeChainInfo public immutable CHAIN_INFO;
    address public immutable MARKET_OBSERVER;
    address public immutable SOURCE_POOL;
    uint64 public immutable SOURCE_CHAIN_KEY;
    uint64 public immutable MAX_PROOF_AGE_BLOCKS;
    uint64 public immutable MAX_CONFIRM_GAP_BLOCKS;

    error InvalidConfiguration();
    error WrongSourceChain();
    error ConfirmationNotNewer();
    error ConfirmationGapTooLarge();
    error LatestAttestationUnavailable();
    error ProofAboveLatestAttestation();
    error ProofTooOld();
    error SourceVerificationFailed();
    error ConfirmationVerificationFailed();
    error TransactionIndexMismatch();

    constructor(
        address blockProver_,
        address chainInfo_,
        address marketObserver_,
        address sourcePool_,
        uint64 sourceChainKey_,
        uint64 maxProofAgeBlocks_,
        uint64 maxConfirmGapBlocks_
    ) {
        if (
            blockProver_ == address(0) || chainInfo_ == address(0) || marketObserver_ == address(0)
                || sourcePool_ == address(0) || sourceChainKey_ == 0 || maxProofAgeBlocks_ == 0
                || maxConfirmGapBlocks_ == 0
        ) revert InvalidConfiguration();

        BLOCK_PROVER = INativeQueryVerifier(blockProver_);
        CHAIN_INFO = INativeChainInfo(chainInfo_);
        MARKET_OBSERVER = marketObserver_;
        SOURCE_POOL = sourcePool_;
        SOURCE_CHAIN_KEY = sourceChainKey_;
        MAX_PROOF_AGE_BLOCKS = maxProofAgeBlocks_;
        MAX_CONFIRM_GAP_BLOCKS = maxConfirmGapBlocks_;
    }

    function verifyPair(ProofData calldata sourceProof, ProofData calldata confirmProof)
        external
        returns (VerifiedObservation memory source, VerifiedObservation memory confirmation)
    {
        if (sourceProof.chainKey != SOURCE_CHAIN_KEY || confirmProof.chainKey != SOURCE_CHAIN_KEY) {
            revert WrongSourceChain();
        }
        if (confirmProof.blockHeight <= sourceProof.blockHeight) revert ConfirmationNotNewer();
        if (confirmProof.blockHeight - sourceProof.blockHeight > MAX_CONFIRM_GAP_BLOCKS) {
            revert ConfirmationGapTooLarge();
        }

        INativeChainInfo.HeightHashResult memory latest =
            CHAIN_INFO.get_latest_attestation_height_and_hash(SOURCE_CHAIN_KEY);
        if (!latest.exists || !latest.isAttestation) revert LatestAttestationUnavailable();
        if (sourceProof.blockHeight > latest.height || confirmProof.blockHeight > latest.height) {
            revert ProofAboveLatestAttestation();
        }
        if (latest.height - confirmProof.blockHeight > MAX_PROOF_AGE_BLOCKS) revert ProofTooOld();

        if (!BLOCK_PROVER.verifyAndEmit(
                sourceProof.chainKey,
                sourceProof.blockHeight,
                sourceProof.encodedTransaction,
                sourceProof.merkleProof,
                sourceProof.continuityProof
            )) revert SourceVerificationFailed();
        if (!BLOCK_PROVER.verifyAndEmit(
                confirmProof.chainKey,
                confirmProof.blockHeight,
                confirmProof.encodedTransaction,
                confirmProof.merkleProof,
                confirmProof.continuityProof
            )) revert ConfirmationVerificationFailed();

        if (
            BLOCK_PROVER.calculateTxIndex(sourceProof.merkleProof) != uint64(sourceProof.transactionIndex)
                || BLOCK_PROVER.calculateTxIndex(confirmProof.merkleProof) != uint64(confirmProof.transactionIndex)
        ) revert TransactionIndexMismatch();

        AttestedMarketEventDecoder.Observation memory sourceEvent =
            AttestedMarketEventDecoder.decode(sourceProof.encodedTransaction, MARKET_OBSERVER, SOURCE_POOL);
        AttestedMarketEventDecoder.Observation memory confirmationEvent =
            AttestedMarketEventDecoder.decode(confirmProof.encodedTransaction, MARKET_OBSERVER, SOURCE_POOL);

        source = _withLocation(sourceProof, sourceEvent);
        confirmation = _withLocation(confirmProof, confirmationEvent);
    }

    function _withLocation(ProofData calldata proof, AttestedMarketEventDecoder.Observation memory eventData)
        private
        pure
        returns (VerifiedObservation memory result)
    {
        result = VerifiedObservation({
            blockHeight: proof.blockHeight,
            transactionIndex: proof.transactionIndex,
            reporter: eventData.reporter,
            arithmeticMeanTick: eventData.arithmeticMeanTick,
            spotSqrtPriceX96: eventData.spotSqrtPriceX96,
            liquidity: eventData.liquidity,
            priceE6: eventData.priceE6
        });
    }
}
