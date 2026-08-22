// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ASCTreasuryJournal} from "../../src/ASCTreasuryJournal.sol";
import {INativeQueryVerifier} from "../../src/interfaces/INativeQueryVerifier.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockDexRouter} from "../../src/mocks/MockDexRouter.sol";
import {MockNativeQueryVerifier} from "../../src/mocks/MockNativeQueryVerifier.sol";
import {PriceObservation} from "../../src/source-chain/PriceObservation.sol";

/// @notice Common fixture for ASCTreasuryJournal tests: deploys mock USDC + mock quote
///         token, a mock constant-product router seeded with balanced liquidity, a mock
///         Attestcoin verifier, a REAL instance of the toy Sepolia `PriceObservation`
///         contract (the actual source-chain contract the production system proves), and
///         the treasury contract itself, funded and with one registered agent. Also
///         provides helpers to build ProofData tuples with a chosen price/status and
///         register them as "verified" on the mock verifier.
///
///         The `encodedTransaction` payloads this fixture builds use the REAL
///         EVM-transaction-envelope encoding produced by the `gluwa/usc-sdk` npm
///         package's `encoding.abi.abiEncode(tx, receipt)` — `abi.encode(uint8 txType, bytes[]
///         chunks)` — so the on-chain decoder is exercised against the exact format a
///         real Attestcoin proof carries, not a simplified stand-in. See
///         `_buildEncodedTransaction` and DEVLOG.md session 3.
abstract contract TestBase is Test {
    // Mirror the SDK's tuple types used inside `abi.encode` for access lists and receipt
    // logs, so the encoded envelope's shapes match v1.ts byte-for-byte.
    struct AccessListEntry {
        address account;
        bytes32[] storageKeys;
    }

    struct LogEntry {
        address addr;
        bytes32[] topics;
        bytes data;
    }

    ASCTreasuryJournal internal treasury;
    MockERC20 internal usdc;
    MockERC20 internal quote;
    MockDexRouter internal router;
    MockNativeQueryVerifier internal verifier;
    PriceObservation internal priceSource;

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
        priceSource = new PriceObservation();

        treasury = new ASCTreasuryJournal(
            address(verifier),
            address(router),
            address(usdc),
            address(quote),
            address(priceSource),
            owner
        );

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

    /// @dev Builds an `encodedTransaction` matching the `@gluwa/usc-sdk`'s
    ///      `encoding.abi.abiEncode(tx, receipt)` output for a call to
    ///      `PriceObservation.observePrice(uint256)` followed by its receipt:
    ///      `abi.encode(uint8 txType, bytes[] chunks)` with three independently encoded
    ///      chunks:
    ///        chunk0 = common tx fields: (nonce, gasLimit, from, toIsNull, to, value, data)
    ///        chunk1 = transaction-type fields for `txType` (0 / 1 / 2 — the only kinds a
    ///                 plain Sepolia send produces)
    ///        chunk2 = receipt fields:   (receiptStatus, receiptGasUsed, logs, logsBloom)
    ///      The layouts mirror the packaged SDK source (`src/encoding/abi/v1.ts`,
    ///      v0.18.0); see DEVLOG.md session 3. `success` maps to the EIP-658 receipt
    ///      status.
    function _buildEncodedTransaction(uint256 price, bool success, address to, uint8 txType)
        internal
        pure
        returns (bytes memory)
    {
        // The underlying source tx's calldata: 4-byte selector + one ABI word.
        bytes memory data = abi.encodePacked(bytes4(keccak256("observePrice(uint256)")), abi.encode(price));

        // Chunk 0 — common tx fields. Identical layout for every tx type in the SDK.
        bytes memory chunk0 = abi.encode(
            uint64(7), // nonce
            uint64(200_000), // gas limit
            address(uint160(0xa11ce)), // from
            false, // toIsNull
            to, // to
            uint256(0), // value
            data // data = the observePrice(uint256) calldata
        );

        // Chunk 1 — tx-type-specific fields. Tests exercise type 2 by default (EIP-1559,
        // a plain Sepolia send) and type 0 in the type-decoding test.
        AccessListEntry[] memory noAccessList = new AccessListEntry[](0);
        bytes memory chunk1;
        if (txType == 0) {
            chunk1 = abi.encode(
                uint128(15_000_000_000), // gasPrice
                uint256(27), // v
                bytes32(uint256(0xaaaa)), // r
                bytes32(uint256(0xbbbb)) // s
            );
        } else if (txType == 1) {
            chunk1 = abi.encode(
                uint64(11_155_111), // chainId
                uint128(15_000_000_000), // gasPrice
                noAccessList, // accessList
                uint8(1), // yParity
                bytes32(uint256(0x1234)), // r
                bytes32(uint256(0x5678)) // s
            );
        } else {
            chunk1 = abi.encode(
                uint64(11_155_111), // chainId
                uint128(2_000_000_000), // maxPriorityFeePerGas
                uint128(50_000_000_000), // maxFeePerGas
                noAccessList, // accessList
                uint8(1), // yParity
                bytes32(uint256(0x1234)), // r
                bytes32(uint256(0x5678)) // s
            );
        }

        // Chunk 2 — receipt fields. The contract's decoder only reads the status/gasUsed
        // head of this chunk, but the shape is still the real (uint8,uint64,tuple[],bytes).
        LogEntry[] memory noLogs = new LogEntry[](0);
        bytes memory chunk2 = abi.encode(uint8(success ? 1 : 0), uint64(50_000), noLogs, bytes(""));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk0;
        chunks[1] = chunk1;
        chunks[2] = chunk2;

        return abi.encode(txType, chunks);
    }

    /// @dev Core proof builder: encodes a real v1 envelope and (optionally) registers it as
    ///      "verified" on the mock verifier.
    function _buildProof(
        uint64 blockHeight,
        uint32 txIndex,
        uint256 price,
        bool success,
        address to,
        uint8 txType,
        bool registerWithVerifier
    ) internal returns (ASCTreasuryJournal.ProofData memory proof) {
        bytes memory encodedTx = _buildEncodedTransaction(price, success, to, txType);

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

        if (registerWithVerifier) {
            verifier.setVerificationResult(SOURCE_CHAIN_KEY, blockHeight, encodedTx, true);
        }
    }

    /// @dev Default verified proof: an EIP-1559 (type 2) transaction to the real
    ///      `priceSource`, the shape a normal Attestcoin-derived Sepolia proof takes.
    function buildVerifiedProof(uint64 blockHeight, uint32 txIndex, uint256 price, bool success)
        internal
        returns (ASCTreasuryJournal.ProofData memory proof)
    {
        return _buildProof(blockHeight, txIndex, price, success, address(priceSource), 2, true);
    }

    /// @dev A verified proof whose `to` is overridden — used by the wrong-source
    ///      rejection test to prove the decoder actually enforces the source contract.
    function buildVerifiedProofTo(uint64 blockHeight, uint32 txIndex, uint256 price, bool success, address to)
        internal
        returns (ASCTreasuryJournal.ProofData memory proof)
    {
        return _buildProof(blockHeight, txIndex, price, success, to, 2, true);
    }

    /// @dev Same as buildVerifiedProof but deliberately NOT registered on the mock
    ///      verifier, so verification will fail — tests the "verification failed" path.
    function buildUnverifiedProof(uint64 blockHeight, uint32 txIndex, uint256 price)
        internal
        returns (ASCTreasuryJournal.ProofData memory proof)
    {
        return _buildProof(blockHeight, txIndex, price, true, address(0xdead), 2, false);
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
