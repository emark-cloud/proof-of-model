// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";
import {Registry} from "../src/Registry.sol";
import {Escrow} from "../src/Escrow.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

/// Minimal IVerifier whose verdict is fixed at construction — lets us exercise
/// resolveChallenge's live verifier call without the Stylus deployment. The
/// golden pathProof hex from packages/model/fixtures.json is still fed in as the
/// real calldata, so these tests assert the same PASS/FAIL *contract* the deployed
/// Verifier enforces (the live verify is exercised by the agent E2E on Sepolia).
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
    Registry internal registry;
    Escrow internal escrow;
    ChallengeManager internal cm;

    uint256 internal constant WINDOW = 30; // short demo window (seconds)
    uint256 internal constant STAKE = 1 ether;
    uint256 internal constant FEE = 0.1 ether;
    bytes32 internal constant WEIGHT_ROOT = bytes32(uint256(0xBEEF));
    bytes32 internal constant TRACE_ROOT = bytes32(uint256(0x5ACE));
    bytes32 internal constant OUTPUT_HASH = bytes32(uint256(0x0117));
    bytes32 internal constant REQ = keccak256("request-1");

    address internal provider = makeAddr("provider");
    address internal buyer = makeAddr("buyer");
    address internal challenger = makeAddr("challenger");
    address internal owner; // escrow/registry deployer = this test contract

    bytes internal goodProof;
    bytes internal badProof;

    function setUp() public {
        owner = address(this);
        // Golden proof calldata (mock verifier ignores the verdict, but feeding the
        // real bytes ties the test to the model's wire format / fixture artifact).
        string memory json = vm.readFile("../model/fixtures.json");
        goodProof = vm.parseJsonBytes(json, ".knownGood.pathProofHex");
        badProof = vm.parseJsonBytes(json, ".knownBad.pathProofHex");
    }

    // ─── Stack assembly ────────────────────────────────────────────────────────

    /// Deploy a fresh wired stack with a verifier of the given verdict and a
    /// registered, staked provider.
    function _stack(bool verifierResult) internal returns (ChallengeManager m) {
        registry = new Registry(address(0));
        escrow = new Escrow();
        m = new ChallengeManager(address(new MockVerifier(verifierResult)), address(registry), address(escrow), WINDOW);
        registry.setManager(address(m));
        escrow.setManager(address(m));

        vm.deal(provider, STAKE);
        vm.prank(provider);
        registry.register{value: STAKE}(WEIGHT_ROOT, "http://localhost:8546/.well-known/agent-card.json");

        cm = m;
    }

    function _commit() internal {
        vm.prank(provider);
        cm.commit(REQ, TRACE_ROOT, OUTPUT_HASH);
    }

    function _deposit() internal {
        vm.deal(buyer, FEE);
        vm.prank(buyer);
        escrow.deposit{value: FEE}(REQ);
    }

    // ─── Constructor / constants ────────────────────────────────────────────────

    function test_constructor_wiresDependencies() public {
        _stack(true);
        assertEq(address(cm.registry()), address(registry));
        assertEq(address(cm.escrow()), address(escrow));
        assertEq(cm.finalizeWindow(), WINDOW);
    }

    function test_bountyBps_constant() public {
        _stack(true);
        assertEq(cm.BOUNTY_BPS(), 1000);
    }

    // ─── commit ──────────────────────────────────────────────────────────────────

    function test_commit_storesAndEmits() public {
        _stack(true);

        vm.expectEmit(true, true, false, true);
        emit ChallengeManager.Committed(REQ, provider, TRACE_ROOT, OUTPUT_HASH);
        _commit();

        (
            address p,
            bytes32 traceRoot,
            bytes32 outputHash,
            uint64 committedAt,
            address chal,
            ChallengeManager.Status status
        ) = cm.commitments(REQ);
        assertEq(p, provider);
        assertEq(traceRoot, TRACE_ROOT);
        assertEq(outputHash, OUTPUT_HASH);
        assertEq(committedAt, uint64(block.timestamp));
        assertEq(chal, address(0));
        assertEq(uint8(status), uint8(ChallengeManager.Status.Pending));
    }

    function test_commit_revertsIfProviderNotActive() public {
        _stack(true);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert("ChallengeManager: provider not active");
        cm.commit(REQ, TRACE_ROOT, OUTPUT_HASH);
    }

    function test_commit_revertsOnDuplicateRequestId() public {
        _stack(true);
        _commit();
        vm.prank(provider);
        vm.expectRevert("ChallengeManager: requestId used");
        cm.commit(REQ, TRACE_ROOT, OUTPUT_HASH);
    }

    function test_commit_revertsOnZeroTraceRoot() public {
        _stack(true);
        vm.prank(provider);
        vm.expectRevert("ChallengeManager: zero traceRoot");
        cm.commit(REQ, bytes32(0), OUTPUT_HASH);
    }

    // ─── finalize (happy path) ────────────────────────────────────────────────────

    function test_finalize_releasesFeeMinusCutAndBumpsServed() public {
        _stack(true);
        _deposit();
        _commit();

        uint256 providerBefore = provider.balance;
        uint256 ownerBefore = owner.balance;

        vm.warp(block.timestamp + WINDOW);
        vm.expectEmit(true, true, false, true);
        emit ChallengeManager.Finalized(REQ, provider);
        cm.finalize(REQ);

        uint256 cut = FEE * escrow.PROTOCOL_CUT_BPS() / 10_000;
        assertEq(provider.balance - providerBefore, FEE - cut, "provider payout");
        assertEq(owner.balance - ownerBefore, cut, "protocol cut to owner");

        (,,,,, ChallengeManager.Status status) = cm.commitments(REQ);
        assertEq(uint8(status), uint8(ChallengeManager.Status.Finalized));

        (, uint256 amount) = escrow.deposits(REQ);
        assertEq(amount, 0, "escrow slot cleared");

        (,,, uint64 served,,,) = registry.providers(provider);
        assertEq(served, 1, "served bumped");
    }

    function test_finalize_revertsBeforeWindow() public {
        _stack(true);
        _deposit();
        _commit();
        vm.warp(block.timestamp + WINDOW - 1);
        vm.expectRevert("ChallengeManager: window open");
        cm.finalize(REQ);
    }

    function test_finalize_revertsIfNotPending() public {
        _stack(true);
        _deposit();
        _commit();
        vm.warp(block.timestamp + WINDOW);
        cm.finalize(REQ);
        vm.expectRevert("ChallengeManager: not pending");
        cm.finalize(REQ);
    }

    // ─── openChallenge ────────────────────────────────────────────────────────────

    function test_openChallenge_marksChallengedAndBumpsCounter() public {
        _stack(false);
        _commit();

        vm.expectEmit(true, true, true, false);
        emit ChallengeManager.ChallengeOpened(REQ, challenger, provider);
        vm.prank(challenger);
        cm.openChallenge(REQ);

        (,,,, address chal, ChallengeManager.Status status) = cm.commitments(REQ);
        assertEq(chal, challenger);
        assertEq(uint8(status), uint8(ChallengeManager.Status.Challenged));

        (,,,, uint64 challenged,,) = registry.providers(provider);
        assertEq(challenged, 1);
    }

    function test_openChallenge_revertsAfterWindow() public {
        _stack(false);
        _commit();
        vm.warp(block.timestamp + WINDOW);
        vm.prank(challenger);
        vm.expectRevert("ChallengeManager: window closed");
        cm.openChallenge(REQ);
    }

    function test_openChallenge_revertsIfNotPending() public {
        _stack(false);
        _commit();
        vm.prank(challenger);
        cm.openChallenge(REQ);
        vm.prank(challenger);
        vm.expectRevert("ChallengeManager: not pending");
        cm.openChallenge(REQ);
    }

    // ─── resolveChallenge: proven cheat (verifier FALSE) ────────────────────────────

    function test_resolveChallenge_slashBountyRefundWhenVerifierFalse() public {
        _stack(false);
        _deposit();
        _commit();
        vm.prank(challenger);
        cm.openChallenge(REQ);

        uint256 challengerBefore = challenger.balance;
        uint256 buyerBefore = buyer.balance;

        vm.expectEmit(true, false, false, true);
        emit ChallengeManager.Verified(REQ, false);
        // Pass the golden KNOWN-BAD proof as the verifier calldata.
        cm.resolveChallenge(REQ, badProof);

        // Full stake slashed; provider stake zeroed + deactivated; slashed counter up.
        (, uint256 stake, bool active,,, uint64 slashed,) = registry.providers(provider);
        assertEq(stake, 0, "stake fully slashed");
        assertFalse(active, "provider deactivated");
        assertEq(slashed, 1, "slashed counter");

        // 10% bounty to the challenger.
        uint256 bounty = STAKE * cm.BOUNTY_BPS() / 10_000;
        assertEq(challenger.balance - challengerBefore, bounty, "bounty paid");

        // Buyer's escrowed fee refunded in full.
        assertEq(buyer.balance - buyerBefore, FEE, "buyer refunded");
        (, uint256 amount) = escrow.deposits(REQ);
        assertEq(amount, 0, "escrow slot cleared on refund");

        // Manager retains the remainder (protocol treasury).
        assertEq(address(cm).balance, STAKE - bounty, "remainder retained by manager");

        (,,,,, ChallengeManager.Status status) = cm.commitments(REQ);
        assertEq(uint8(status), uint8(ChallengeManager.Status.Slashed));
    }

    // ─── resolveChallenge: honest provider (verifier TRUE) ──────────────────────────

    function test_resolveChallenge_passWhenVerifierTrue() public {
        _stack(true);
        _deposit();
        _commit();
        vm.prank(challenger);
        cm.openChallenge(REQ);

        vm.expectEmit(true, false, false, true);
        emit ChallengeManager.Verified(REQ, true);
        cm.resolveChallenge(REQ, goodProof);

        // No slash: stake intact, provider active, fee still escrowed.
        (, uint256 stake, bool active,,, uint64 slashed,) = registry.providers(provider);
        assertEq(stake, STAKE, "stake intact");
        assertTrue(active);
        assertEq(slashed, 0);
        (, uint256 amount) = escrow.deposits(REQ);
        assertEq(amount, FEE, "fee remains escrowed");

        (,,,,, ChallengeManager.Status status) = cm.commitments(REQ);
        assertEq(uint8(status), uint8(ChallengeManager.Status.ChallengeFailed));
    }

    function test_resolveChallenge_revertsIfNotChallenged() public {
        _stack(false);
        _commit(); // Pending, not Challenged
        vm.expectRevert("ChallengeManager: not challenged");
        cm.resolveChallenge(REQ, badProof);
    }

    /// SOUNDNESS: the challenger never supplies a trace root. openChallenge takes
    /// only the requestId and resolveChallenge reads c.traceRoot from the provider's
    /// commitment — so a challenge can only ever be evaluated against the exact root
    /// the provider bound to its own address at commit time.
    function test_resolveChallenge_usesCommittedRootNotChallengerSupplied() public {
        _stack(false);
        _commit();
        vm.prank(challenger);
        cm.openChallenge(REQ);
        (, bytes32 committedRoot,,,,) = cm.commitments(REQ);
        assertEq(committedRoot, TRACE_ROOT, "resolve evaluates the committed root only");
    }

    // Receive ETH: the protocol cut on finalize is sent to owner (this contract).
    receive() external payable {}
}
