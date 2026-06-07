// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";
import {Registry} from "../src/Registry.sol";

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
}
