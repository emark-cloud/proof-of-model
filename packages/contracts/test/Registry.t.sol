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

    function test_register_revertsOnDoubleRegister() public {
        bytes32 hW = keccak256("model-weight-root");
        registry.register{value: 1 ether}(hW);
        vm.expectRevert("Registry: already registered");
        registry.register{value: 1 ether}(hW);
    }

    // ─── Slash (manager-gated, money-moving core) ─────────────────────────────

    /// Register provider 0xABCD with 1 ether and wire `mgr` as manager.
    function _registerAndSetManager(address provider, address mgr) internal {
        bytes32 hW = keccak256("model-weight-root");
        vm.deal(provider, 1 ether);
        vm.prank(provider);
        registry.register{value: 1 ether}(hW);
        registry.setManager(mgr);
    }

    function test_slash_reducesStakeForwardsToManagerAndCountsUp() public {
        address provider = address(0xABCD);
        address mgr = address(0xCAFE);
        _registerAndSetManager(provider, mgr);

        uint256 mgrBefore = mgr.balance;
        vm.prank(mgr);
        uint256 actual = registry.slash(provider, 0.4 ether);

        assertEq(actual, 0.4 ether);
        assertEq(mgr.balance - mgrBefore, 0.4 ether);
        (, uint256 stake, bool active,,, uint64 slashed) = registry.providers(provider);
        assertEq(stake, 0.6 ether);
        assertTrue(active);
        assertEq(slashed, 1);
    }

    function test_slash_capsAtStakeAndDeactivatesAtZero() public {
        address provider = address(0xABCD);
        address mgr = address(0xCAFE);
        _registerAndSetManager(provider, mgr);

        vm.prank(mgr);
        uint256 actual = registry.slash(provider, 5 ether); // request exceeds stake

        assertEq(actual, 1 ether); // capped at available stake
        (, uint256 stake, bool active,,,) = registry.providers(provider);
        assertEq(stake, 0);
        assertFalse(active); // deactivated when fully slashed
    }

    function test_slash_revertsIfNotManager() public {
        registry.setManager(address(0xCAFE));
        vm.expectRevert("Registry: caller is not manager");
        registry.slash(address(0xABCD), 1 ether); // caller is this contract, not manager
    }

    // ─── Reputation counters (onlyManager gate) ───────────────────────────────

    function test_recordServedAndChallenged_incrementWhenManager() public {
        address provider = address(0xABCD);
        address mgr = address(0xCAFE);
        _registerAndSetManager(provider, mgr);

        vm.prank(mgr);
        registry.recordServed(provider);
        vm.prank(mgr);
        registry.recordChallenged(provider);

        (,,, uint64 served, uint64 challenged,) = registry.providers(provider);
        assertEq(served, 1);
        assertEq(challenged, 1);
    }

    function test_recordServed_revertsIfNotManager() public {
        registry.setManager(address(0xCAFE));
        vm.expectRevert("Registry: caller is not manager");
        registry.recordServed(address(0xABCD));
    }

    function test_recordChallenged_revertsIfNotManager() public {
        registry.setManager(address(0xCAFE));
        vm.expectRevert("Registry: caller is not manager");
        registry.recordChallenged(address(0xABCD));
    }

    // Required so this test contract can receive ETH from Registry.withdraw().
    receive() external payable {}
}
