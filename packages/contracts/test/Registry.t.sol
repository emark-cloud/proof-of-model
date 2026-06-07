// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry internal registry;

    function setUp() public {
        // Pass address(0) for verifier — Registry stores it but does not call it directly.
        registry = new Registry(address(0));
    }

    // ─── Existing tests (must stay green) ────────────────────────────────────

    function test_register_storesProviderAndStake() public {
        bytes32 hW = keccak256("model-weight-root");
        registry.register{value: 1 ether}(hW);

        (bytes32 weightRoot, uint256 stake, bool active,,,) = registry.providers(address(this));
        assertEq(weightRoot, hW);
        assertEq(stake, 1 ether);
        assertTrue(active);
    }

    function test_register_revertsOnZeroRoot() public {
        vm.expectRevert("Registry: zero weightRoot");
        registry.register(bytes32(0));
    }

    // ─── Reputation fields ────────────────────────────────────────────────────

    function test_reputation_defaultsToZero() public {
        bytes32 hW = keccak256("model-weight-root");
        registry.register{value: 1 ether}(hW);

        (,,,uint64 served, uint64 challenged, uint64 slashed) = registry.providers(address(this));
        assertEq(served, 0);
        assertEq(challenged, 0);
        assertEq(slashed, 0);
    }

    function test_weightRootOf_returnsCorrectRoot() public {
        bytes32 hW = keccak256("model-weight-root");
        registry.register{value: 1 ether}(hW);
        assertEq(registry.weightRootOf(address(this)), hW);
    }

    // ─── Verifier wiring ──────────────────────────────────────────────────────

    function test_verifier_wiredAtConstruction() public view {
        assertEq(address(registry.verifier()), address(0));
    }

    function test_verifier_storesNonZeroAddress() public {
        address fakeVerifier = address(0xBEEF);
        Registry r = new Registry(fakeVerifier);
        assertEq(address(r.verifier()), fakeVerifier);
    }

    // ─── Manager / setManager ─────────────────────────────────────────────────

    function test_setManager_storesManagerAndEmitsEvent() public {
        address mgr = address(0xCAFE);
        vm.expectEmit(true, false, false, false);
        emit Registry.ManagerSet(mgr);
        registry.setManager(mgr);
        assertEq(registry.manager(), mgr);
    }

    function test_setManager_revertsIfNotOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Registry: not owner");
        registry.setManager(address(0xCAFE));
    }

    function test_setManager_revertsOnSecondSet() public {
        registry.setManager(address(0xCAFE));
        vm.expectRevert("Registry: manager already set");
        registry.setManager(address(0xBEEF));
    }

    // ─── MIN_STAKE guard ──────────────────────────────────────────────────────

    function test_register_revertsOnZeroStake() public {
        bytes32 hW = keccak256("model-weight-root");
        vm.expectRevert("Registry: below min stake");
        registry.register(hW); // no value
    }

    // ─── Withdraw ─────────────────────────────────────────────────────────────

    function test_withdraw_returnsStakeAndDeregisters() public {
        bytes32 hW = keccak256("model-weight-root");
        registry.register{value: 1 ether}(hW);

        uint256 balanceBefore = address(this).balance;
        registry.withdraw();
        uint256 balanceAfter = address(this).balance;

        assertEq(balanceAfter - balanceBefore, 1 ether);
        (,, bool active,,,) = registry.providers(address(this));
        assertFalse(active);
    }

    function test_withdraw_revertsIfNotRegistered() public {
        vm.expectRevert("Registry: not registered");
        registry.withdraw();
    }

    // Required so this test contract can receive ETH from Registry.withdraw().
    receive() external payable {}
}
