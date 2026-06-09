// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";
import {Escrow} from "../src/Escrow.sol";

/// @notice Deploy Registry + Escrow + ChallengeManager to Arbitrum Sepolia and wire
///         the manager into both Registry and Escrow.
/// @dev Run: forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast
///
///      Env vars:
///        VERIFIER_ADDR    deployed Stylus Verifier (defaults to address(0) — set it).
///        FINALIZE_WINDOW  finalize window in seconds (defaults to 30 — short demo
///                         window so the E2E completes in seconds; mainnet would use
///                         e.g. 86400). Document the override in the run log.
///
///      Example:
///        VERIFIER_ADDR=0xd46e05f6... FINALIZE_WINDOW=30 \
///          forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
contract Deploy is Script {
    function run() external returns (Registry registry, ChallengeManager challengeManager, Escrow escrow) {
        address verifierAddr = vm.envOr("VERIFIER_ADDR", address(0));
        uint256 finalizeWindow = vm.envOr("FINALIZE_WINDOW", uint256(30));

        vm.startBroadcast();

        // Dependency order: Registry + Escrow first, then the manager that wires them.
        registry = new Registry(verifierAddr);
        console.log("Registry:         ", address(registry));

        escrow = new Escrow();
        console.log("Escrow:           ", address(escrow));

        challengeManager = new ChallengeManager(verifierAddr, address(registry), address(escrow), finalizeWindow);
        console.log("ChallengeManager: ", address(challengeManager));
        console.log("finalizeWindow(s):", finalizeWindow);

        // The manager calls registry.slash/recordServed/recordChallenged and
        // escrow.release/refund — gate both to it.
        registry.setManager(address(challengeManager));
        escrow.setManager(address(challengeManager));
        console.log("Registry.manager + Escrow.manager set to ChallengeManager");

        vm.stopBroadcast();
    }
}
