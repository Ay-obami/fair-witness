// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ASCTreasuryJournal} from "../src/ASCTreasuryJournal.sol";

/// @notice Deploys ASCTreasuryJournal to Creditcoin testnet.
/// @dev Run from a machine with real RPC access (this sandbox does not have it — see
///      DEVLOG.md). Requires env vars:
///        VERIFIER_ADDRESS     - the real Attestcoin Block Prover precompile (0x0FD2 per
///                                the docs, but confirm on the target network)
///        DEX_ROUTER_ADDRESS   - PenguinSwap's real router address on Creditcoin testnet
///                                (UNCONFIRMED — see DEVLOG.md "Pitfall: PenguinSwap's
///                                real ABI unconfirmed"; verify this contract's ABI
///                                matches src/interfaces/IDexRouter.sol before deploying,
///                                or adapt the interface first)
///        BASE_ASSET_ADDRESS   - Sepolia USDC bridged/represented on Creditcoin, OR the
///                                Creditcoin-side asset this treasury actually holds
///                                (clarify which per the PRD's cross-chain flow before
///                                deploying — this contract trades BASE_ASSET against
///                                QUOTE_ASSET entirely on the Creditcoin side; the
///                                Sepolia-side USDC only informs the agent's off-chain
///                                price observation, it is never held by this contract)
///        QUOTE_ASSET_ADDRESS  - the paired token on PenguinSwap
///        OWNER_ADDRESS        - who can register/deregister agents (use a multisig for
///                                anything beyond a demo)
///        PRIVATE_KEY          - deployer key (NEVER the agent's submit key — see
///                                DEVLOG.md custody-separation notes)
contract Deploy is Script {
    function run() external returns (ASCTreasuryJournal treasury) {
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address dexRouter = vm.envAddress("DEX_ROUTER_ADDRESS");
        address baseAsset = vm.envAddress("BASE_ASSET_ADDRESS");
        address quoteAsset = vm.envAddress("QUOTE_ASSET_ADDRESS");
        address owner = vm.envAddress("OWNER_ADDRESS");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        console.log("Deploying ASCTreasuryJournal with:");
        console.log("  verifier   :", verifier);
        console.log("  dexRouter  :", dexRouter);
        console.log("  baseAsset  :", baseAsset);
        console.log("  quoteAsset :", quoteAsset);
        console.log("  owner      :", owner);

        vm.startBroadcast(deployerKey);
        treasury = new ASCTreasuryJournal(verifier, dexRouter, baseAsset, quoteAsset, owner);
        vm.stopBroadcast();

        console.log("Deployed ASCTreasuryJournal at:", address(treasury));
        console.log("");
        console.log("NEXT STEPS (not automated by this script):");
        console.log("1. treasury.registerAgent(<agent runner's submit address>) as owner");
        console.log("2. Fund the treasury directly with BASE_ASSET (it holds its own capital)");
        console.log("3. Confirm the agent submit key holds ZERO BASE_ASSET/QUOTE_ASSET balance");
        console.log("   and no token approvals to anything other than what this contract sets");
        console.log("   internally at call time");
    }
}
