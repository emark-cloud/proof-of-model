// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Escrow} from "../src/Escrow.sol";

contract EscrowTest is Test {
    Escrow internal escrow;

    address internal buyer = makeAddr("buyer");
    address internal provider = makeAddr("provider");
    address internal manager = makeAddr("manager");

    bytes32 internal constant REQ = keccak256("req");
    uint256 internal constant FEE = 1 ether;

    function setUp() public {
        escrow = new Escrow(); // owner = this
        escrow.setManager(manager);
    }

    function _deposit() internal {
        vm.deal(buyer, FEE);
        vm.prank(buyer);
        escrow.deposit{value: FEE}(REQ);
    }

    // ─── constants / setManager ─────────────────────────────────────────────────

    function test_protocolCut_constant() public view {
        assertEq(escrow.PROTOCOL_CUT_BPS(), 500);
    }

    function test_setManager_revertsIfNotOwner() public {
        Escrow e = new Escrow();
        vm.prank(makeAddr("stranger"));
        vm.expectRevert("Escrow: not owner");
        e.setManager(manager);
    }

    function test_setManager_revertsOnSecondSet() public {
        vm.expectRevert("Escrow: manager already set");
        escrow.setManager(address(0xCAFE));
    }

    // ─── deposit ──────────────────────────────────────────────────────────────────

    function test_deposit_recordsBuyerAndEmits() public {
        vm.deal(buyer, FEE);
        vm.expectEmit(true, true, false, true);
        emit Escrow.Deposited(REQ, buyer, FEE);
        vm.prank(buyer);
        escrow.deposit{value: FEE}(REQ);

        (address b, uint256 amount) = escrow.deposits(REQ);
        assertEq(b, buyer);
        assertEq(amount, FEE);
        assertEq(address(escrow).balance, FEE);
    }

    function test_deposit_revertsOnZero() public {
        vm.prank(buyer);
        vm.expectRevert("Escrow: zero deposit");
        escrow.deposit(REQ);
    }

    function test_deposit_revertsOnDuplicateRequestId() public {
        _deposit();
        vm.deal(buyer, FEE);
        vm.prank(buyer);
        vm.expectRevert("Escrow: requestId used");
        escrow.deposit{value: FEE}(REQ);
    }

    // ─── release ────────────────────────────────────────────────────────────────────

    function test_release_splitsCutAndPayout() public {
        _deposit();
        uint256 cut = FEE * escrow.PROTOCOL_CUT_BPS() / 10_000;
        uint256 ownerBefore = address(this).balance; // owner == this

        vm.expectEmit(true, true, false, true);
        emit Escrow.Released(REQ, provider, FEE - cut, cut);
        vm.prank(manager);
        escrow.release(REQ, provider);

        assertEq(provider.balance, FEE - cut, "provider payout");
        assertEq(address(this).balance - ownerBefore, cut, "owner cut");
        (, uint256 amount) = escrow.deposits(REQ);
        assertEq(amount, 0, "slot cleared");
    }

    function test_release_revertsIfNotManager() public {
        _deposit();
        vm.expectRevert("Escrow: caller is not manager");
        escrow.release(REQ, provider); // caller = this, not manager
    }

    function test_release_revertsIfNothing() public {
        vm.prank(manager);
        vm.expectRevert("Escrow: nothing to release");
        escrow.release(REQ, provider);
    }

    // ─── refund ──────────────────────────────────────────────────────────────────────

    function test_refund_returnsToRecordedBuyer() public {
        _deposit();
        uint256 buyerBefore = buyer.balance;

        vm.expectEmit(true, true, false, true);
        emit Escrow.Refunded(REQ, buyer, FEE);
        vm.prank(manager);
        escrow.refund(REQ);

        assertEq(buyer.balance - buyerBefore, FEE, "buyer refunded");
        (, uint256 amount) = escrow.deposits(REQ);
        assertEq(amount, 0, "slot cleared");
    }

    function test_refund_revertsIfNotManager() public {
        _deposit();
        vm.expectRevert("Escrow: caller is not manager");
        escrow.refund(REQ);
    }

    function test_refund_revertsIfNothing() public {
        vm.prank(manager);
        vm.expectRevert("Escrow: nothing to refund");
        escrow.refund(REQ);
    }

    // owner == this; receives the protocol cut on release.
    receive() external payable {}
}
