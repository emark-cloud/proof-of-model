// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {Registry} from "./Registry.sol";
import {Escrow} from "./Escrow.sol";

/// @title ChallengeManager
/// @notice The Phase-2 challenge game. A request flows through a single
///         `requestId`-keyed lifecycle that binds money (Escrow) to the
///         provider's on-chain commitment:
///
///           PAY      buyer    → Escrow.deposit(requestId){fee}
///           COMMIT   provider → commit(requestId, traceRoot, outputHash)
///           FINALIZE anyone   → finalize(requestId)          (after window, if unchallenged)
///                              → Escrow.release → provider; registry.recordServed
///           CHALLENGE          challenger → openChallenge(requestId)   (within window)
///           RESOLVE            challenger → resolveChallenge(requestId, pathProof)
///                              → verifier.verifyPath(committedRoot, H_w, proof)
///                                FAIL: slash full stake, 10% bounty → challenger,
///                                      Escrow.refund → buyer
///                                PASS: ChallengeFailed (provider honest on this path)
///
/// @dev SOUNDNESS: `traceRoot` is read from the provider's commitment
///      (`msg.sender`-bound at commit time), never supplied by the challenger.
///      A cheating provider cannot repudiate the root it served.
contract ChallengeManager {
    /// @dev Fraction of slashed stake paid to the winning challenger (basis points).
    uint256 public constant BOUNTY_BPS = 1000; // 10%

    IVerifier public immutable verifier;
    Registry public immutable registry;
    Escrow public immutable escrow;

    /// @notice Time after commit during which a challenge may be opened; once
    ///         elapsed (and unchallenged) the request may finalize. Constructor
    ///         arg so the demo can use a short window (e.g. 30s) while mainnet
    ///         would use a real one (e.g. 1 day).
    uint256 public immutable finalizeWindow;

    enum Status {
        None, // no commitment for this requestId
        Pending, // committed, within/at finalize window, not yet challenged
        Challenged, // a challenge is open, awaiting resolveChallenge
        Finalized, // window elapsed unchallenged → fee released to provider
        Slashed, // resolveChallenge proved a cheat → stake slashed, buyer refunded
        ChallengeFailed // resolveChallenge: provider honest on the sampled path
    }

    struct Commitment {
        address provider; // msg.sender at commit time — the source of truth
        bytes32 traceRoot; // R committed by the provider for this request
        bytes32 outputHash; // binds the served output (non-repudiable)
        uint64 committedAt; // commit timestamp; window = committedAt + finalizeWindow
        address challenger; // set when a challenge is opened (bounty recipient)
        Status status;
    }

    mapping(bytes32 requestId => Commitment) public commitments;

    event Committed(
        bytes32 indexed requestId,
        address indexed provider,
        bytes32 traceRoot,
        bytes32 outputHash
    );
    event Finalized(bytes32 indexed requestId, address indexed provider);
    event ChallengeOpened(
        bytes32 indexed requestId,
        address indexed challenger,
        address indexed provider
    );
    event Verified(bytes32 indexed requestId, bool ok);
    event Slashed(bytes32 indexed requestId, address indexed provider, uint256 amount, address indexed challenger);
    event BountyPaid(bytes32 indexed requestId, address indexed challenger, uint256 amount);

    // ─── Minimal reentrancy guard (resolveChallenge moves ETH) ────────────────
    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1, "ChallengeManager: reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address verifier_, address registry_, address escrow_, uint256 finalizeWindow_) {
        verifier = IVerifier(verifier_);
        registry = Registry(registry_);
        escrow = Escrow(escrow_);
        finalizeWindow = finalizeWindow_;
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    /// @notice Provider commits the trace root + output hash it served for `requestId`.
    /// @dev `msg.sender` is recorded as the provider — every later step reads it.
    function commit(bytes32 requestId, bytes32 traceRoot, bytes32 outputHash) external {
        require(commitments[requestId].status == Status.None, "ChallengeManager: requestId used");
        require(traceRoot != bytes32(0), "ChallengeManager: zero traceRoot");
        require(registry.isActive(msg.sender), "ChallengeManager: provider not active");

        commitments[requestId] = Commitment({
            provider: msg.sender,
            traceRoot: traceRoot,
            outputHash: outputHash,
            committedAt: uint64(block.timestamp),
            challenger: address(0),
            status: Status.Pending
        });
        emit Committed(requestId, msg.sender, traceRoot, outputHash);
    }

    /// @notice After the finalize window with no open challenge, release the fee
    ///         to the provider and bump its served counter. Callable by anyone.
    function finalize(bytes32 requestId) external {
        Commitment storage c = commitments[requestId];
        require(c.status == Status.Pending, "ChallengeManager: not pending");
        require(block.timestamp >= c.committedAt + finalizeWindow, "ChallengeManager: window open");

        c.status = Status.Finalized;
        escrow.release(requestId, c.provider);
        registry.recordServed(c.provider);
        emit Finalized(requestId, c.provider);
    }

    /// @notice Open a challenge against a pending commitment, within the window.
    /// @dev The challenger asserts nothing about the root — it is read from the
    ///      commitment at resolve time.
    function openChallenge(bytes32 requestId) external {
        Commitment storage c = commitments[requestId];
        require(c.status == Status.Pending, "ChallengeManager: not pending");
        require(block.timestamp < c.committedAt + finalizeWindow, "ChallengeManager: window closed");

        c.status = Status.Challenged;
        c.challenger = msg.sender;
        registry.recordChallenged(c.provider);
        emit ChallengeOpened(requestId, msg.sender, c.provider);
    }

    /// @notice Resolve an open challenge: verify the path against the COMMITTED
    ///         trace root and the provider's registered weight root.
    /// @dev FAIL ⇒ slash full stake, pay 10% bounty to the challenger, refund the
    ///      buyer's escrowed fee. PASS ⇒ ChallengeFailed (provider was honest on
    ///      this path; the request can no longer finalize automatically — left for
    ///      the demo's single-shot game; multi-round is roadmap).
    function resolveChallenge(bytes32 requestId, bytes calldata pathProof) external nonReentrant {
        Commitment storage c = commitments[requestId];
        require(c.status == Status.Challenged, "ChallengeManager: not challenged");

        bytes32 weightRoot = registry.weightRootOf(c.provider);
        bool ok = verifier.verifyPath(c.traceRoot, weightRoot, pathProof);
        emit Verified(requestId, ok);

        if (ok) {
            c.status = Status.ChallengeFailed;
            return;
        }

        // Proven cheat. Effects before interactions.
        c.status = Status.Slashed;
        address provider = c.provider;
        address challenger = c.challenger;

        // Slash the full stake; Registry caps at available and forwards ETH here.
        uint256 slashed = registry.slash(provider, type(uint256).max);
        uint256 bounty = slashed * BOUNTY_BPS / 10_000;

        // Refund the buyer's escrowed fee (a proven cheat delivered nothing of value).
        escrow.refund(requestId);

        emit Slashed(requestId, provider, slashed, challenger);

        if (bounty > 0) {
            (bool sent,) = challenger.call{value: bounty}("");
            require(sent, "ChallengeManager: bounty transfer failed");
            emit BountyPaid(requestId, challenger, bounty);
        }
        // Remainder (slashed - bounty) stays in this contract: protocol-retained treasury.
    }

    /// @dev Receive slashed ETH forwarded from Registry.slash (paid out as bounty).
    receive() external payable {}
}
