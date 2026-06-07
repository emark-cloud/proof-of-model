// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Escrow} from "../src/Escrow.sol";

contract EscrowTest is Test {
    Escrow internal escrow;

    function setUp() public {
        escrow = new Escrow();
    }

    /// Phase-1 skeleton: deposit must revert so no ETH is locked on the live deploy
    /// while release()/refund() are still stubs.
    function test_deposit_revertsInPhase1() public {
        vm.expectRevert("Escrow: not implemented (Phase 2)");
        escrow.deposit{value: 1 ether}(keccak256("req"));
    }

    function test_protocolCut_constant() public view {
        assertEq(escrow.PROTOCOL_CUT_BPS(), 500);
    }
}
