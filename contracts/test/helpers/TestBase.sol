// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ASCTreasuryJournal} from "../../src/ASCTreasuryJournal.sol";
import {INativeQueryVerifier} from "../../src/interfaces/INativeQueryVerifier.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockDexRouter} from "../../src/mocks/MockDexRouter.sol";
import {MockNativeQueryVerifier} from "../../src/mocks/MockNativeQueryVerifier.sol";

/// @notice Common fixture for ASCTreasuryJournal tests: deploys mock USDC + mock quote
///         token, a mock constant-product router seeded with balanced liquidity, a mock
///         Attestcoin verifier, and the treasury contract itself, funded and with one
///         registered agent. Also provides helpers to build ProofData tuples with a chosen
///         price/status and register them as "verified" on the mock verifier.
abstract contract TestBase is Test {
    ASCTreasuryJournal internal treasury;
    MockERC20 internal usdc;
    MockERC20 internal quote;
    MockDexRouter internal router;
    MockNativeQueryVerifier internal verifier;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal liquidityProvider = makeAddr("lp");

    uint64 internal constant SOURCE_CHAIN_KEY = 1; // Sepolia, per Attestcoin chain registry

    // Pool seeded 1:1 (before the 0.3% swap fee) so a 1 USDC quote comes back at ~0.997.
    uint256 internal constant POOL_LIQUIDITY = 1_000_000e6;

    function setUp() public virtual {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        quote = new MockERC20("Mock Quote Token", "MQT", 6);
        router = new MockDexRouter(address(usdc), address(quote));
        verifier = new MockNativeQueryVerifier();

        treasury = new ASCTreasuryJournal(address(verifier), address(router), address(usdc), address(quote), owner);

        vm.prank(owner);
        treasury.registerAgent(agent);

        // Seed the mock DEX with balanced liquidity.
        usdc.mint(liquidityProvider, POOL_LIQUIDITY);
        quote.mint(liquidityProvider, POOL_LIQUIDITY);
        vm.startPrank(liquidityProvider);
        usdc.approve(address(router), POOL_LIQUIDITY);
        quote.approve(address(router), POOL_LIQUIDITY);
        router.seedLiquidity(POOL_LIQUIDITY, POOL_LIQUIDITY);
        vm.stopPrank();

        // Fund the treasury directly — it holds its own capital, never the agent.
        usdc.mint(address(treasury), 1_000e6);
    }

    /// @dev Current DEX quote for 1 USDC in quote-token terms, 6-decimal fixed point.
    ///      With the pool seeded 1:1 minus the 0.3% swap fee, this comes out to ~997000.
    function currentDexPrice() internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(quote);
        return router.getAmountOut(1e6, path);
    }

    /// @dev Builds a ProofData struct for a given (blockHeight, txIndex, price, success)
    ///      tuple and registers it as "verified" on the mock verifier, so
    ///      VERIFIER.verifyAndEmit(...) will return true for it inside the contract call.
    function buildVerifiedProof(uint64 blockHeight, uint32 txIndex, uint256 price, bool success)
        internal
        returns (ASCTreasuryJournal.ProofData memory proof)
    {
        bytes memory encodedTx = abi.encodePacked(bytes4(0x12345678), abi.encode(price, success ? uint8(1) : uint8(0)));

        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        bytes32[] memory roots = new bytes32[](0);

        proof = ASCTreasuryJournal.ProofData({
            chainKey: SOURCE_CHAIN_KEY,
            blockHeight: blockHeight,
            transactionIndex: txIndex,
            encodedTransaction: encodedTx,
            merkleProof: INativeQueryVerifier.MerkleProof({root: bytes32(0), siblings: siblings}),
            continuityProof: INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: roots})
        });

        verifier.setVerificationResult(SOURCE_CHAIN_KEY, blockHeight, encodedTx, true);
    }

    /// @dev Same as buildVerifiedProof but deliberately does NOT register it with the mock
    ///      verifier, so verification will fail — used to test the "verification failed"
    ///      revert paths.
    function buildUnverifiedProof(uint64 blockHeight, uint32 txIndex, uint256 price)
        internal
        pure
        returns (ASCTreasuryJournal.ProofData memory proof)
    {
        bytes memory encodedTx = abi.encodePacked(bytes4(0x12345678), abi.encode(price, uint8(1)));
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        bytes32[] memory roots = new bytes32[](0);

        proof = ASCTreasuryJournal.ProofData({
            chainKey: SOURCE_CHAIN_KEY,
            blockHeight: blockHeight,
            transactionIndex: txIndex,
            encodedTransaction: encodedTx,
            merkleProof: INativeQueryVerifier.MerkleProof({root: bytes32(0), siblings: siblings}),
            continuityProof: INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: roots})
        });
    }

    /// @dev Deterministic nonce derivation matching the off-chain agent's rule from the
    ///      PRD: keccak256(factKey, actionType, srcPrice, destPrice). Exposed here so
    ///      tests can compute the "same" nonce a real agent (or a retried agent run)
    ///      would independently derive from the same fact.
    function deterministicNonce(bytes32 factKey, uint256 srcPrice, uint256 destPrice) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(factKey, ASCTreasuryJournal.ActionType.ARBITRAGE, srcPrice, destPrice)));
    }

    function factKeyOf(ASCTreasuryJournal.ProofData memory proof) internal pure returns (bytes32) {
        return keccak256(abi.encode(proof.chainKey, proof.blockHeight, proof.transactionIndex));
    }

    /// @dev Builds a matched pair of (sourceProof, confirmProof) tuned to pass every
    ///      rigid bound by default: small drift between them, and a wide-enough gap
    ///      against the current DEX price. `salt` varies the block height so repeated
    ///      calls in the same test produce distinct factKeys.
    function buildHappyPathProofs(uint32 salt)
        internal
        returns (
            ASCTreasuryJournal.ProofData memory sourceProof,
            ASCTreasuryJournal.ProofData memory confirmProof,
            uint256 srcPrice,
            uint256 confPrice
        )
    {
        srcPrice = 1_005_000; // 1.005, in 6-decimal fixed point
        confPrice = 1_010_000; // 1.010 — ~50bps drift from src, within MAX_DRIFT_BPS (100)
        // ~1.3% gap vs the ~0.997 DEX price — comfortably above MIN_ARB_WIDTH_BPS (80)
        sourceProof = buildVerifiedProof(1_000_000 + salt, 0, srcPrice, true);
        confirmProof = buildVerifiedProof(1_000_003 + salt, 0, confPrice, true);
    }
}
