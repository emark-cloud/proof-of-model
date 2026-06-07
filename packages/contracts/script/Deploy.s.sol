// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";
import {Escrow} from "../src/Escrow.sol";

/// @notice Deploy Registry + ChallengeManager + Escrow to Arbitrum Sepolia.
/// @dev Run: forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast
///
///      Set VERIFIER_ADDR env var to the deployed Stylus Verifier address before running.
///      If not set, deploys with address(0) — update via a follow-up deploy once Verifier
///      is live (CI-gated, see phase1-plan.md §2.3).
///
///      Example:
///        VERIFIER_ADDR=0x... forge script script/Deploy.s.sol \
///          --rpc-url arbitrum_sepolia --broadcast --verify
contract Deploy is Script {
    function run() external returns (Registry registry, ChallengeManager challengeManager, Escrow escrow) {
        address verifierAddr = vm.envOr("VERIFIER_ADDR", address(0));

        vm.startBroadcast();

        registry = new Registry(verifierAddr);
        console.log("Registry:         ", address(registry));

        challengeManager = new ChallengeManager(verifierAddr, address(registry));
        console.log("ChallengeManager: ", address(challengeManager));

        escrow = new Escrow();
        console.log("Escrow:           ", address(escrow));

        // Wire ChallengeManager as the manager so it can call registry.slash / recordChallenged.
        registry.setManager(address(challengeManager));
        console.log("Registry.manager set to ChallengeManager");

        vm.stopBroadcast();
    }
}
