// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";
import {Registry} from "../src/Registry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

/// Minimal IVerifier whose verdict is fixed at construction — lets us exercise
/// resolveChallenge's live verifier call without the Stylus deployment.
contract MockVerifier is IVerifier {
    bool internal immutable result;

    constructor(bool result_) {
        result = result_;
    }

    function verifyPath(bytes32, bytes32, bytes calldata) external view returns (bool) {
        return result;
    }
}

contract ChallengeManagerTest is Test {
    ChallengeManager internal cm;
    Registry internal registry;

    address internal constant FAKE_VERIFIER = address(0xBEEF);

    function setUp() public {
        registry = new Registry(FAKE_VERIFIER);
        cm = new ChallengeManager(FAKE_VERIFIER, address(registry));
    }

    function test_constructor_storesVerifierAndRegistry() public view {
        assertEq(address(cm.verifier()), FAKE_VERIFIER);
        assertEq(address(cm.registry()), address(registry));
    }

    function test_openChallenge_storesAndEmitsEvent() public {
        address provider = address(0xCAFE);
        bytes32 traceRoot = keccak256("trace-root");

        vm.expectEmit(true, true, true, true);
        emit ChallengeManager.ChallengeOpened(0, address(this), provider, traceRoot);

        uint256 id = cm.openChallenge(provider, traceRoot, "");
        assertEq(id, 0);

        (
            address challenger,
            address storedProvider,
            bytes32 storedRoot,
            ,
            ChallengeManager.ChallengeStatus status
        ) = cm.challenges(0);

        assertEq(challenger, address(this));
        assertEq(storedProvider, provider);
        assertEq(storedRoot, traceRoot);
        assertEq(uint8(status), uint8(ChallengeManager.ChallengeStatus.Open));
    }

    function test_nextChallengeId_incrementsPerOpen() public {
        address provider = address(0xCAFE);
        bytes32 root = keccak256("root");
        assertEq(cm.openChallenge(provider, root, ""), 0);
        assertEq(cm.openChallenge(provider, root, ""), 1);
        assertEq(cm.nextChallengeId(), 2);
    }

    function test_finalizeWindow_constant() public view {
        assertEq(cm.FINALIZE_WINDOW(), 1 days);
    }

    function test_bountyBps_constant() public view {
        assertEq(cm.BOUNTY_BPS(), 1000);
    }

    // ─── resolveChallenge (live verifier call) ────────────────────────────────

    function _openOn(ChallengeManager c) internal returns (uint256 id) {
        id = c.openChallenge(address(0xCAFE), keccak256("trace-root"), "");
    }

    function test_resolveChallenge_passWhenVerifierReturnsTrue() public {
        ChallengeManager c = new ChallengeManager(address(new MockVerifier(true)), address(registry));
        uint256 id = _openOn(c);

        vm.expectEmit(true, false, false, true);
        emit ChallengeManager.Verified(id, true);
        c.resolveChallenge(id, "");

        (,,,, ChallengeManager.ChallengeStatus status) = c.challenges(id);
        assertEq(uint8(status), uint8(ChallengeManager.ChallengeStatus.Passed));
    }

    function test_resolveChallenge_slashWhenVerifierReturnsFalse() public {
        ChallengeManager c = new ChallengeManager(address(new MockVerifier(false)), address(registry));
        uint256 id = _openOn(c);

        vm.expectEmit(true, false, false, true);
        emit ChallengeManager.Verified(id, false);
        c.resolveChallenge(id, "");

        (,,,, ChallengeManager.ChallengeStatus status) = c.challenges(id);
        assertEq(uint8(status), uint8(ChallengeManager.ChallengeStatus.Slashed));
    }

    function test_resolveChallenge_revertsIfNotOpen() public {
        ChallengeManager c = new ChallengeManager(address(new MockVerifier(true)), address(registry));
        uint256 id = _openOn(c);
        c.resolveChallenge(id, ""); // first resolve → status leaves Open
        vm.expectRevert("ChallengeManager: not open");
        c.resolveChallenge(id, "");
    }
}
