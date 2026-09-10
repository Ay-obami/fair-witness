// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./helpers/TestBase.sol";
import {INativeQueryVerifier} from "../src/interfaces/INativeQueryVerifier.sol";
import {ASCTreasuryJournal} from "../src/ASCTreasuryJournal.sol";

/// @notice Treasury policy tests with the disclosed mock verifier, not live proof validation.
contract ProofIdentityTest is TestBase {
    function test_RevertOnSameProofWithChangedTransactionIndex() public {
        (ASCTreasuryJournal.ProofData memory src, ASCTreasuryJournal.ProofData memory confirm,,) =
            buildHappyPathProofs(0);
        bytes32 decisionHash = keccak256("same decision");
        bytes32 verifiedInputs = keccak256(
            abi.encode(src.chainKey, src.blockHeight, src.encodedTransaction, src.merkleProof, src.continuityProof)
        );
        vm.prank(agent);
        treasury.executeArbitrage(src, confirm, 0, decisionHash, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
        uint256 baseBalance = usdc.balanceOf(address(treasury));
        uint256 quoteBalance = quote.balanceOf(address(treasury));

        src.transactionIndex = 1;
        assertEq(
            verifiedInputs,
            keccak256(
                abi.encode(src.chainKey, src.blockHeight, src.encodedTransaction, src.merkleProof, src.continuityProof)
            ),
            "all verifier inputs must remain identical"
        );
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.TransactionIndexMismatch.selector);
        treasury.executeArbitrage(src, confirm, 0, decisionHash, ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
        assertEq(treasury.journalLength(), 1);
        assertEq(usdc.balanceOf(address(treasury)), baseBalance);
        assertEq(quote.balanceOf(address(treasury)), quoteBalance);
    }

    function testFuzz_RevertOnForgedSourceIndex(uint32 claimed) public {
        vm.assume(claimed != 0);
        (ASCTreasuryJournal.ProofData memory src, ASCTreasuryJournal.ProofData memory confirm,,) =
            buildHappyPathProofs(0);
        src.transactionIndex = claimed;
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.TransactionIndexMismatch.selector);
        treasury.executeArbitrage(src, confirm, 0, bytes32(0), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
        assertEq(treasury.journalLength(), 0);
    }

    function testFuzz_RevertOnForgedConfirmationIndex(uint32 claimed) public {
        vm.assume(claimed != 0);
        (ASCTreasuryJournal.ProofData memory src, ASCTreasuryJournal.ProofData memory confirm,,) =
            buildHappyPathProofs(0);
        confirm.transactionIndex = claimed;
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.TransactionIndexMismatch.selector);
        treasury.executeArbitrage(src, confirm, 0, bytes32(0), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
        assertEq(treasury.journalLength(), 0);
    }

    function testFuzz_MatchingIndicesExecuteAndJournal(uint32 sourceIndex, uint32 confirmIndex) public {
        (ASCTreasuryJournal.ProofData memory src, ASCTreasuryJournal.ProofData memory confirm,,) =
            buildHappyPathProofs(0);
        src.transactionIndex = sourceIndex;
        confirm.transactionIndex = confirmIndex;
        src.merkleProof.siblings = pathFor(sourceIndex, 32);
        confirm.merkleProof.siblings = pathFor(confirmIndex, 32);
        vm.prank(agent);
        bytes32 key =
            treasury.executeArbitrage(src, confirm, 0, bytes32(0), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
        ASCTreasuryJournal.JournalEntry memory entry = treasury.getJournalEntry(key);
        assertEq(entry.sourceTxIndex, sourceIndex);
        assertEq(entry.confirmTxIndex, confirmIndex);
        assertEq(entry.factKey, factKeyOf(src));
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
        treasury.executeArbitrage(
            src, confirm, 1, keccak256("changed decision"), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote
        );
    }

    function test_RevertRatherThanTruncateProofIndex() public {
        (ASCTreasuryJournal.ProofData memory src, ASCTreasuryJournal.ProofData memory confirm,,) =
            buildHappyPathProofs(0);
        // The low 32 bits equal the supplied index, but the proven position differs.
        src.transactionIndex = type(uint32).max;
        src.merkleProof.siblings = pathFor((uint64(1) << 33) - 1, 33);
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.TransactionIndexMismatch.selector);
        treasury.executeArbitrage(src, confirm, 0, bytes32(0), ASCTreasuryJournal.TradeDirection.BuyBaseForQuote);
        assertEq(treasury.journalLength(), 0);
    }

    function pathFor(uint64 index, uint256 depth)
        internal
        pure
        returns (INativeQueryVerifier.MerkleProofEntry[] memory siblings)
    {
        siblings = new INativeQueryVerifier.MerkleProofEntry[](depth);
        for (uint256 i = 0; i < depth; ++i) {
            siblings[i] = INativeQueryVerifier.MerkleProofEntry({
                hash: bytes32(0), isLeft: (index & (uint64(1) << uint64(i))) != 0
            });
        }
    }
}
