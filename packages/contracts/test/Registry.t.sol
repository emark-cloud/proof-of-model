// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry internal registry;

    function setUp() public {
        registry = new Registry();
    }

    function test_register_storesProviderAndStake() public {
        bytes32 hW = keccak256("model-weight-root");
        registry.register{value: 1 ether}(hW);

        (bytes32 weightRoot, uint256 stake, bool active) = registry.providers(address(this));
        assertEq(weightRoot, hW);
        assertEq(stake, 1 ether);
        assertTrue(active);
    }

    function test_register_revertsOnZeroRoot() public {
        vm.expectRevert("Registry: zero weightRoot");
        registry.register(bytes32(0));
    }
}
