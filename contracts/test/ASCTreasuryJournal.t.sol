// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./helpers/TestBase.sol";
import {ASCTreasuryJournal} from "../src/ASCTreasuryJournal.sol";

contract ASCTreasuryJournalTest is TestBase {
    // -------------------------------------------------------------------
    // Sanity: happy path executes and journals correctly. Not one of the
    // 8 PRD acceptance criteria on its own, but every other test below
    // depends on this path working, so it's proven first.
    // -------------------------------------------------------------------

    function test_ExecuteArbitrageSuccess() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);

        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);
        bytes32 decisionHash = keccak256(bytes("gap=1.3% width sufficient, act"));

        uint256 treasuryUsdcBefore = usdc.balanceOf(address(treasury));
        uint256 treasuryQuoteBefore = quote.balanceOf(address(treasury));

        vm.prank(agent);
        bytes32 actionKey =
            treasury.executeArbitrage(src, confirm, nonce, decisionHash, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        assertTrue(treasury.executedActions(actionKey), "action should be marked executed");
        assertEq(treasury.journalLength(), 1, "journal should have one entry");

        ASCTreasuryJournal.JournalEntry memory entry = treasury.getJournalEntry(actionKey);
        assertEq(entry.factKey, factKey);
        assertEq(entry.agent, agent);
        assertEq(entry.decisionHash, decisionHash);
        assertTrue(uint8(entry.actionType) == uint8(ASCTreasuryJournal.ActionType.ARBITRAGE));

        // Round-trip (Task 3.3): the BUY leg sells quote out of the treasury and
        // receives base — and the agent itself never touched any of it.
        assertGt(usdc.balanceOf(address(treasury)), treasuryUsdcBefore, "treasury USDC should increase (bought base)");
        assertLt(quote.balanceOf(address(treasury)), treasuryQuoteBefore, "treasury quote should decrease (spent)");
        // Symmetric cap: BASE received is bounded by MAX_TRADE_SIZE regardless of direction.
        assertLe(
            usdc.balanceOf(address(treasury)) - treasuryUsdcBefore,
            treasury.MAX_TRADE_SIZE(),
            "base received within cap"
        );
        assertEq(usdc.balanceOf(agent), 0, "agent must never hold USDC");
        assertEq(quote.balanceOf(agent), 0, "agent must never hold quote token");
    }

    // -------------------------------------------------------------------
    // 1. No function other than executeArbitrage can move treasury funds.
    // -------------------------------------------------------------------

    function test_NoOtherFunctionCanMoveFunds() public {
        uint256 usdcBefore = usdc.balanceOf(address(treasury));
        uint256 quoteBefore = quote.balanceOf(address(treasury));

        // Owner-only admin functions exist (registerAgent/deregisterAgent) — confirm they
        // are incapable of moving funds, since they touch only the agent allowlist.
        vm.startPrank(owner);
        treasury.registerAgent(makeAddr("someOtherAgent"));
        treasury.deregisterAgent(makeAddr("someOtherAgent"));
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(treasury)), usdcBefore, "admin calls must not move USDC");
        assertEq(quote.balanceOf(address(treasury)), quoteBefore, "admin calls must not move quote token");

        // Common "escape hatch" selectors must not exist on this contract at all — probe
        // with low-level calls and confirm they all fail (no matching function, and no
        // fallback that could silently succeed).
        bytes4[5] memory suspectSelectors = [
            bytes4(keccak256("withdraw(address,uint256)")),
            bytes4(keccak256("withdraw(uint256)")),
            bytes4(keccak256("sweep(address,uint256)")),
            bytes4(keccak256("emergencyWithdraw(address)")),
            bytes4(keccak256("rescueTokens(address,uint256)"))
        ];

        for (uint256 i = 0; i < suspectSelectors.length; i++) {
            vm.prank(owner);
            (bool success,) =
                address(treasury).call(abi.encodePacked(suspectSelectors[i], abi.encode(address(usdc), uint256(1))));
            assertFalse(success, "no escape-hatch selector should succeed");
        }

        assertEq(usdc.balanceOf(address(treasury)), usdcBefore, "USDC balance must be unchanged after probing");
    }

    // -------------------------------------------------------------------
    // 2. Agent holds zero balance across a fuzzed sequence of valid executions.
    // -------------------------------------------------------------------

    function testFuzz_AgentNeverHoldsFunds(uint8 numExecutions) public {
        uint256 n = bound(numExecutions, 1, 6); // MAX_ACTIONS_PER_EPOCH is 6

        for (uint256 i = 0; i < n; i++) {
            (
                ASCTreasuryJournal.ProofData memory src,
                ASCTreasuryJournal.ProofData memory confirm,
                uint256 srcPrice,
                uint256 confPrice
            ) = buildHappyPathProofs(uint32(i * 10));
            bytes32 factKey = factKeyOf(src);
            uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

            vm.prank(agent);
            treasury.executeArbitrage(src, confirm, nonce, keccak256(abi.encode("run", i)), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

            assertEq(usdc.balanceOf(agent), 0, "agent USDC balance must stay zero after every execution");
            assertEq(quote.balanceOf(agent), 0, "agent quote balance must stay zero after every execution");
        }
    }

    // -------------------------------------------------------------------
    // 3. Identical proof + nonce submitted twice -> second call reverts.
    // -------------------------------------------------------------------

    function test_RevertOnExactReplay() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);
        bytes32 decisionHash = keccak256(bytes("first submission"));

        vm.prank(agent);
        treasury.executeArbitrage(src, confirm, nonce, decisionHash, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
        treasury.executeArbitrage(src, confirm, nonce, decisionHash, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 4. Crash-and-retry simulation: nonce independently RE-DERIVED (not literally
    //    cached calldata) from the same fact must still collide and be rejected.
    // -------------------------------------------------------------------

    function test_RevertOnDeterministicNonceRetryAfterSimulatedCrash() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);

        // "Run 1": agent derives nonce, submits, then the process crashes before it
        // observes the receipt (from its point of view, the outcome is unknown).
        uint256 nonceRun1 = deterministicNonce(factKey, srcPrice, confPrice);
        bytes32 decisionHashRun1 = keccak256(bytes("run 1 reasoning"));
        vm.prank(agent);
        treasury.executeArbitrage(src, confirm, nonceRun1, decisionHashRun1, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        // "Run 2": agent restarts, re-polls, re-evaluates the SAME attested fact from
        // scratch, and independently re-derives its nonce using the same deterministic
        // formula (not by reading any cache) — it must land on the identical value.
        uint256 nonceRun2 = deterministicNonce(factKey, srcPrice, confPrice);
        assertEq(nonceRun1, nonceRun2, "deterministic derivation must reproduce the same nonce");

        bytes32 decisionHashRun2 = keccak256(bytes("run 2 reasoning (re-derived independently)"));
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
        treasury.executeArbitrage(src, confirm, nonceRun2, decisionHashRun2, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 5. confirmProof price outside MAX_DRIFT_BPS of sourceProof -> reverts.
    // -------------------------------------------------------------------

    function test_RevertOnExcessiveDrift() public {
        uint256 srcPrice = 900_000;
        uint256 confPrice = 1_010_000; // ~12.2% drift, far past MAX_DRIFT_BPS (1%)

        ASCTreasuryJournal.ProofData memory src = buildVerifiedProof(2_000_000, 0, srcPrice, true);
        ASCTreasuryJournal.ProofData memory confirm = buildVerifiedProof(2_000_003, 0, confPrice, true);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.PriceDriftTooHigh.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("drift test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 6. Arbitrage width under MIN_ARB_WIDTH_BPS -> reverts.
    // -------------------------------------------------------------------

    function test_RevertOnNarrowArbitrageWindow() public {
        uint256 dexPrice = currentDexPrice(); // ~997000
        // Confirm price within a hair of the DEX price — gap well under MIN_ARB_WIDTH_BPS.
        uint256 srcPrice = dexPrice;
        uint256 confPrice = dexPrice + (dexPrice * 10 / 10_000); // +10bps, under the 80bps floor

        ASCTreasuryJournal.ProofData memory src = buildVerifiedProof(3_000_000, 0, srcPrice, true);
        ASCTreasuryJournal.ProofData memory confirm = buildVerifiedProof(3_000_003, 0, confPrice, true);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ArbitrageWindowTooNarrow.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("narrow window test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 6b. Task 3.4 net-profitability guard: a window that clears the raw
    //     MIN_ARB_WIDTH_BPS floor but not the platform MIN_NET_EDGE_BPS
    //     reserve on top of it -> still reverts. A gross-positive gap can be
    //     net-unprofitable once fees/slippage/gas are paid.
    // -------------------------------------------------------------------

    function test_RevertWhenGrossWindowClearsFloorButNotNetEdge() public {
        uint256 dexPrice = currentDexPrice(); // ~997000
        // +90bps gross: above the 80bps per-instance floor, but below the
        // 105bps (80 + MIN_NET_EDGE_BPS) the net-profitability gate requires.
        uint256 srcPrice = dexPrice;
        uint256 confPrice = dexPrice + (dexPrice * 90 / 10_000);

        ASCTreasuryJournal.ProofData memory src = buildVerifiedProof(4_000_000, 0, srcPrice, true);
        ASCTreasuryJournal.ProofData memory confirm = buildVerifiedProof(4_000_003, 0, confPrice, true);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ArbitrageWindowTooNarrow.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("net edge test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 6c. Task 3.6: cross-chain confirmation — a structurally valid proof from a
    //     DIFFERENT chain must not be accepted as the confirmation leg, even when
    //     it verifies honestly on its own.
    // -------------------------------------------------------------------

    function test_RevertOnCrossChainConfirmationProof() public {
        uint64 otherChainKey = SOURCE_CHAIN_KEY + 1;
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        confirm.chainKey = otherChainKey;
        // Registered on the mock under the OTHER chain so the pair would pass pure
        // per-proof verification if the relationship check didn't exist.
        verifier.setVerificationResult(otherChainKey, confirm.blockHeight, confirm.encodedTransaction, true);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ChainMismatch.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("cross chain test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 6d. Task 3.6: the decoder must verify the calldata is actually an
    //     observePrice(uint256) call, not just any 36-byte call to the price contract.
    // -------------------------------------------------------------------

    function test_RevertOnWrongObservationSelector() public {
        bytes4 bogusSelector = bytes4(keccak256("notObservePrice(uint256)"));
        ASCTreasuryJournal.ProofData memory src =
            buildVerifiedProofWithSelector(5_000_000, 0, 1_005_000, true, bogusSelector);
        ASCTreasuryJournal.ProofData memory confirm =
            buildVerifiedProofWithSelector(5_000_003, 0, 1_010_000, true, bogusSelector);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, 1_005_000, 1_010_000);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.WrongObservationSelector.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("wrong selector test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 6e. Task 3.6: the journal must carry the full evidence identifiers so a
    //     reviewer can reconstruct the evidence chain from the journal alone.
    // -------------------------------------------------------------------

    function test_JournalRecordsFullEvidenceIdentifiers() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        vm.prank(agent);
        bytes32 actionKey =
            treasury.executeArbitrage(src, confirm, nonce, keccak256("evidence test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        ASCTreasuryJournal.JournalEntry memory entry = treasury.getJournalEntry(actionKey);
        assertEq(entry.sourceChainKey, src.chainKey, "source chain key must be journaled");
        assertEq(entry.sourceBlockHeight, src.blockHeight, "source block height must be journaled");
        assertEq(entry.sourceTxIndex, src.transactionIndex, "source tx index must be journaled");
        assertEq(entry.confirmBlockHeight, confirm.blockHeight, "confirm block height must be journaled");
        assertEq(entry.confirmTxIndex, confirm.transactionIndex, "confirm tx index must be journaled");
    }

    // -------------------------------------------------------------------
    // 7. (MAX_ACTIONS_PER_EPOCH + 1)th valid call in an epoch -> reverts, even with a
    //    fully valid proof.
    // -------------------------------------------------------------------

    function test_RevertOnEpochRateLimitExceeded() public {
        uint256 maxActions = treasury.MAX_ACTIONS_PER_EPOCH();

        for (uint256 i = 0; i < maxActions; i++) {
            (
                ASCTreasuryJournal.ProofData memory src,
                ASCTreasuryJournal.ProofData memory confirm,
                uint256 srcPrice,
                uint256 confPrice
            ) = buildHappyPathProofs(uint32(i * 10));
            bytes32 factKey = factKeyOf(src);
            uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

            vm.prank(agent);
            treasury.executeArbitrage(src, confirm, nonce, keccak256(abi.encode("epoch fill", i)), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
        }

        // One more, fully valid, distinct fact — should still be rejected purely on the
        // rate limit, not on replay or bounds.
        (
            ASCTreasuryJournal.ProofData memory srcN1,
            ASCTreasuryJournal.ProofData memory confirmN1,
            uint256 srcPriceN1,
            uint256 confPriceN1
        ) = buildHappyPathProofs(uint32(maxActions * 10 + 999));
        bytes32 factKeyN1 = factKeyOf(srcN1);
        uint256 nonceN1 = deterministicNonce(factKeyN1, srcPriceN1, confPriceN1);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.EpochRateLimitExceeded.selector);
        treasury.executeArbitrage(srcN1, confirmN1, nonceN1, keccak256("one too many"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // 8. Journal decisionHash for a successful execution matches keccak256 of the
    //    off-chain reasoning payload it was derived from.
    // -------------------------------------------------------------------

    function test_JournalDecisionHashMatchesOffchainReasoning() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        // Simulates the off-chain reasoning payload the agent would store (e.g. in a
        // local KV / IPFS), keyed by its own hash.
        string memory offchainReasoning =
            '{"observedGapBps":130,"sourcePrice":"1005000","confirmPrice":"1010000","rule":"R-ARB-1"}';
        bytes32 decisionHash = keccak256(bytes(offchainReasoning));

        vm.prank(agent);
        bytes32 actionKey =
            treasury.executeArbitrage(src, confirm, nonce, decisionHash, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        ASCTreasuryJournal.JournalEntry memory entry = treasury.getJournalEntry(actionKey);

        // The replay-viewer's core trust claim: independently re-hashing the retrieved
        // off-chain reasoning must match what's committed on-chain.
        assertEq(
            entry.decisionHash,
            keccak256(bytes(offchainReasoning)),
            "on-chain decisionHash must match hash of the off-chain reasoning payload"
        );
    }

    // -------------------------------------------------------------------
    // Bonus: unverified proof (precompile would return false) must revert distinctly.
    // Not one of the 8 PRD criteria, but cheap to add and catches a real failure mode.
    // -------------------------------------------------------------------

    function test_RevertOnUnverifiedSourceProof() public {
        ASCTreasuryJournal.ProofData memory src = buildUnverifiedProof(4_000_000, 0, 1_005_000);
        ASCTreasuryJournal.ProofData memory confirm = buildVerifiedProof(4_000_003, 0, 1_010_000, true);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, 1_005_000, 1_010_000);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.SourceVerificationFailed.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("unverified test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    function test_RevertWhenCalledByUnregisteredAgent() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(ASCTreasuryJournal.NotRegisteredAgent.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("unauthorized test"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // Bonus: the real encodedTransaction envelope supports legacy (type 0) transactions
    // too, not just EIP-1559 — proves _decodePriceObservation walks the envelope by
    // structure, not by hardcoded offsets for one tx type.
    // -------------------------------------------------------------------

    function test_ExecutesWithLegacyType0SourceProof() public {
        uint256 srcPrice = 1_005_000;
        uint256 confPrice = 1_010_000;

        ASCTreasuryJournal.ProofData memory src = _buildProof(
            2_000_000, 0, srcPrice, true, address(priceSource), 0, true
        );
        ASCTreasuryJournal.ProofData memory confirm = buildVerifiedProof(2_000_003, 0, confPrice, true);

        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        vm.prank(agent);
        bytes32 actionKey = treasury.executeArbitrage(src, confirm, nonce, keccak256("legacy type0"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        assertTrue(treasury.executedActions(actionKey), "type-0 encoded proof should decode and execute");
        assertEq(treasury.journalLength(), 1, "journal should record the execution");
    }

    // -------------------------------------------------------------------
    // Bonus: a verified proof whose underlying tx was sent to a DIFFERENT contract
    // (not PRICE_CONTRACT) must be rejected at decode time, not acted on. This is the
    // tightened source-binding guarantee from _decodePriceObservation.
    // -------------------------------------------------------------------

    function test_RevertOnProofFromWrongSourceContract() public {
        address somewhereElse = makeAddr("someOtherContract");
        ASCTreasuryJournal.ProofData memory src =
            buildVerifiedProofTo(3_000_000, 0, 1_005_000, true, somewhereElse);
        ASCTreasuryJournal.ProofData memory confirm = buildVerifiedProof(3_000_003, 0, 1_010_000, true);

        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, 1_005_000, 1_010_000);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.WrongObservationSource.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("wrong source contract"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // Bonus: a proof of a REVERTED underlying source transaction (receipt status 0) must
    // be rejected even though it is honestly attested — Attestcoin proves inclusion, not
    // success, so the decode must check the receipt's EIP-658 status itself.
    // -------------------------------------------------------------------

    function test_RevertOnRevertedUnderlyingSourceTx() public {
        ASCTreasuryJournal.ProofData memory src = buildVerifiedProof(5_000_000, 0, 1_005_000, false);
        ASCTreasuryJournal.ProofData memory confirm = buildVerifiedProof(5_000_003, 0, 1_010_000, true);

        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, 1_005_000, 1_010_000);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.UnderlyingTxNotSuccessful.selector);
        treasury.executeArbitrage(src, confirm, nonce, keccak256("reverted underlying tx"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // Task 3.1 hardening: the actionKey binds ONLY (instance, fact, actionType) —
    // no msg.sender, no caller-supplied decisionNonce. Same fact + a different
    // nonce from the SAME agent must therefore also collide and revert; pre-3.1
    // this minted a fresh key and slipped past the replay guard entirely.
    // -------------------------------------------------------------------

    function test_RevertOnSameFactDifferentNonce() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        vm.prank(agent);
                treasury.executeArbitrage(src, confirm, nonce, keccak256("first nonce"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        // A second run that varies ONLY the nonce — which the contract does not and
        // cannot verify — must collide on the same fact-derived key.
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
                treasury.executeArbitrage(src, confirm, nonce + 1, keccak256("different nonce"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // Task 3.1 hardening: two different registered agents executing against the
    // same underlying fact must not both succeed — the caller is not part of the
    // on-chain identity.
    // -------------------------------------------------------------------

    function test_RevertOnSameFactDifferentRegisteredAgent() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        address agentB = makeAddr("agentB");
        vm.prank(owner);
        treasury.registerAgent(agentB);

        vm.prank(agent);
                treasury.executeArbitrage(src, confirm, nonce, keccak256("agent A run"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);

        // agentB submits the identical fact with its OWN nonce: before the 3.1
        // hardening this minted a distinct actionKey (msg.sender was in the key) and
        // executed a second time against the same fact. It must now revert.
        vm.prank(agentB);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
                treasury.executeArbitrage(src, confirm, nonce + 1, keccak256("agent B run"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
    }

    // -------------------------------------------------------------------
    // Task 3.9: renouncing ownership would leave any registered agent authorized
    // forever, with no owner able to deregister it — permanently disabled.
    // -------------------------------------------------------------------

    function test_OwnerCannotRenounceOwnership() public {
        vm.prank(owner);
        vm.expectRevert(ASCTreasuryJournal.CannotRenounceOwnership.selector);
        treasury.renounceOwnership();

        // Ownership is intact: the owner can still manage the agent allowlist.
        vm.prank(owner);
        treasury.deregisterAgent(agent);
        assertFalse(treasury.registeredAgents(agent), "owner still controls allowlist");
    }

    // -------------------------------------------------------------------
    // Task 3.3: the SELL direction executes against the same DEX when the sign
    // flips — attested reference BELOW the DEX price. Guardrails apply per
    // direction: the BASE sold stays within MAX_TRADE_SIZE.
    // -------------------------------------------------------------------

    function test_ExecutesSellDirection() public {
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildSellSideProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        uint256 usdcBefore = usdc.balanceOf(address(treasury));
        uint256 quoteBefore = quote.balanceOf(address(treasury));

        vm.prank(agent);
        bytes32 actionKey = treasury.executeArbitrage(
            src, confirm, nonce, keccak256("sell direction"), ASCTreasuryJournal.TradeDirection.SellBaseForQuote
        );

        assertTrue(treasury.executedActions(actionKey), "sell-direction execution should journal");
        // Sold base out of the treasury, received quote back — the mirror of the buy leg.
        assertLt(usdc.balanceOf(address(treasury)), usdcBefore, "treasury USDC should decrease (sold base)");
        assertGt(quote.balanceOf(address(treasury)), quoteBefore, "treasury should receive quote");
        // Symmetric cap: BASE sold is bounded by MAX_TRADE_SIZE regardless of direction.
        assertLe(
            usdcBefore - usdc.balanceOf(address(treasury)),
            treasury.MAX_TRADE_SIZE(),
            "base sold within cap"
        );
    }

    // -------------------------------------------------------------------
    // Task 3.5: the caller's proposed direction must match the sign of
    // (destPrice - confPrice). Proposing the opposite direction — economically a
    // loss against the same evidence — reverts instead of executing, and the fact
    // is NOT consumed (a revert unwinds), so a corrected retry remains possible.
    // -------------------------------------------------------------------

    function test_RevertOnWrongTradeDirection() public {
        // Happy-path fixture: destPrice (~0.997) < confPrice (1.010) — evidence says BUY.
        // Proposing the SELL direction must revert.
        (
            ASCTreasuryJournal.ProofData memory srcBuy,
            ASCTreasuryJournal.ProofData memory confirmBuy,
            uint256 srcPriceBuy,
            uint256 confPriceBuy
        ) = buildHappyPathProofs(0);
        bytes32 factKeyBuy = factKeyOf(srcBuy);
        uint256 nonceBuy = deterministicNonce(factKeyBuy, srcPriceBuy, confPriceBuy);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.WrongTradeDirection.selector);
        treasury.executeArbitrage(
            srcBuy,
            confirmBuy,
            nonceBuy,
            keccak256("sell against buy evidence"),
            ASCTreasuryJournal.TradeDirection.SellBaseForQuote
        );

        // Sell-side fixture: destPrice (~0.997) > confPrice (0.985) — evidence says SELL.
        // Proposing the BUY direction must revert the same way.
        (
            ASCTreasuryJournal.ProofData memory srcSell,
            ASCTreasuryJournal.ProofData memory confirmSell,
            uint256 srcPriceSell,
            uint256 confPriceSell
        ) = buildSellSideProofs(0);
        bytes32 factKeySell = factKeyOf(srcSell);
        uint256 nonceSell = deterministicNonce(factKeySell, srcPriceSell, confPriceSell);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.WrongTradeDirection.selector);
        treasury.executeArbitrage(
            srcSell,
            confirmSell,
            nonceSell,
            keccak256("buy against sell evidence"),
            ASCTreasuryJournal.TradeDirection.BuyBaseForQuote
        );
    }
}
