// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";

/// @notice Deploy skeleton (Phase 1 wires Verifier address + ChallengeManager).
/// @dev Run: forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast
contract Deploy is Script {
    function run() external returns (Registry registry) {
        vm.startBroadcast();
        registry = new Registry();
        console.log("Registry:", address(registry));
        vm.stopBroadcast();
    }
}
