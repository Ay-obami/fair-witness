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

        vm.prank(agent);
        bytes32 actionKey = treasury.executeArbitrage(src, confirm, nonce, decisionHash);

        assertTrue(treasury.executedActions(actionKey), "action should be marked executed");
        assertEq(treasury.journalLength(), 1, "journal should have one entry");

        ASCTreasuryJournal.JournalEntry memory entry = treasury.getJournalEntry(actionKey);
        assertEq(entry.factKey, factKey);
        assertEq(entry.agent, agent);
        assertEq(entry.decisionHash, decisionHash);
        assertTrue(uint8(entry.actionType) == uint8(ASCTreasuryJournal.ActionType.ARBITRAGE));

        // Funds moved out of the treasury (into the DEX, then quote tokens back in) —
        // and the agent itself never touched any of it.
        assertLt(usdc.balanceOf(address(treasury)), treasuryUsdcBefore, "treasury USDC should decrease");
        assertGt(quote.balanceOf(address(treasury)), 0, "treasury should receive quote tokens");
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
            treasury.executeArbitrage(src, confirm, nonce, keccak256(abi.encode("run", i)));

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
        treasury.executeArbitrage(src, confirm, nonce, decisionHash);

        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
        treasury.executeArbitrage(src, confirm, nonce, decisionHash);
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
        treasury.executeArbitrage(src, confirm, nonceRun1, decisionHashRun1);

        // "Run 2": agent restarts, re-polls, re-evaluates the SAME attested fact from
        // scratch, and independently re-derives its nonce using the same deterministic
        // formula (not by reading any cache) — it must land on the identical value.
        uint256 nonceRun2 = deterministicNonce(factKey, srcPrice, confPrice);
        assertEq(nonceRun1, nonceRun2, "deterministic derivation must reproduce the same nonce");

        bytes32 decisionHashRun2 = keccak256(bytes("run 2 reasoning (re-derived independently)"));
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
        treasury.executeArbitrage(src, confirm, nonceRun2, decisionHashRun2);
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
        treasury.executeArbitrage(src, confirm, nonce, keccak256("drift test"));
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
        treasury.executeArbitrage(src, confirm, nonce, keccak256("narrow window test"));
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
            treasury.executeArbitrage(src, confirm, nonce, keccak256(abi.encode("epoch fill", i)));
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
        treasury.executeArbitrage(srcN1, confirmN1, nonceN1, keccak256("one too many"));
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
        bytes32 actionKey = treasury.executeArbitrage(src, confirm, nonce, decisionHash);

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
        treasury.executeArbitrage(src, confirm, nonce, keccak256("unverified test"));
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
        treasury.executeArbitrage(src, confirm, nonce, keccak256("unauthorized test"));
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
        bytes32 actionKey = treasury.executeArbitrage(src, confirm, nonce, keccak256("legacy type0"));

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
        treasury.executeArbitrage(src, confirm, nonce, keccak256("wrong source contract"));
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
        treasury.executeArbitrage(src, confirm, nonce, keccak256("reverted underlying tx"));
    }
}
