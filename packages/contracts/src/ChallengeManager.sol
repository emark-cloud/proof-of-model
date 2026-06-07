// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {Registry} from "./Registry.sol";

/// @title ChallengeManager
/// @notice Skeleton for the Phase-2 challenge game. Defines the finalize window,
///         challenge lifecycle events, and entrypoints. Real slash/bounty logic is Phase 2.
/// @dev Constructor wires the Stylus Verifier + Registry. Phase 1 goal: compile, deploy,
///      lock the interface the agents code against.
contract ChallengeManager {
    uint256 public constant FINALIZE_WINDOW = 1 days;
    /// @dev Fraction of slashed stake paid to the winning challenger (basis points).
    uint256 public constant BOUNTY_BPS = 1000; // 10%

    IVerifier public immutable verifier;
    Registry public immutable registry;

    enum ChallengeStatus {
        Open,
        Passed, // verifier returned true (provider honest on this path)
        Slashed // verifier returned false (proven cheat)
    }

    struct Challenge {
        address challenger;
        address provider;
        bytes32 traceRoot;
        uint256 openedAt;
        ChallengeStatus status;
    }

    uint256 public nextChallengeId;
    mapping(uint256 => Challenge) public challenges;

    event ChallengeOpened(
        uint256 indexed challengeId,
        address indexed challenger,
        address indexed provider,
        bytes32 traceRoot
    );
    event Verified(uint256 indexed challengeId, bool ok);
    event Slashed(address indexed provider, uint256 amount, address indexed challenger);
    event BountyPaid(address indexed challenger, uint256 amount);

    constructor(address verifier_, address registry_) {
        verifier = IVerifier(verifier_);
        registry = Registry(registry_);
    }

    /// @notice Open a challenge against a provider's committed trace.
    /// @dev Phase 2 adds: bond deposit, FINALIZE_WINDOW enforcement, registry.recordChallenged.
    function openChallenge(address provider, bytes32 traceRoot, bytes calldata /*pathProof*/)
        external
        returns (uint256 challengeId)
    {
        challengeId = nextChallengeId++;
        challenges[challengeId] = Challenge({
            challenger: msg.sender,
            provider: provider,
            traceRoot: traceRoot,
            openedAt: block.timestamp,
            status: ChallengeStatus.Open
        });
        emit ChallengeOpened(challengeId, msg.sender, provider, traceRoot);
    }

    /// @notice Resolve an open challenge: call the Verifier, emit result.
    /// @dev Phase 2 adds: slash provider stake via registry.slash, pay bounty to challenger,
    ///      emit Slashed + BountyPaid. Verifier call is live even in Phase 1 so the
    ///      IVerifier wiring is exercised end-to-end on deployment.
    function resolveChallenge(uint256 challengeId, bytes calldata pathProof) external {
        Challenge storage c = challenges[challengeId];
        require(c.status == ChallengeStatus.Open, "ChallengeManager: not open");
        bytes32 weightRoot = registry.weightRootOf(c.provider);
        bool ok = verifier.verifyPath(c.traceRoot, weightRoot, pathProof);
        c.status = ok ? ChallengeStatus.Passed : ChallengeStatus.Slashed;
        emit Verified(challengeId, ok);
        // Phase 2: if (!ok) { uint256 slashed = registry.slash(c.provider, ...); emit Slashed; emit BountyPaid; }
    }

    /// @dev Allow receiving ETH forwarded from Registry.slash (Phase 2 distributes as bounty).
    receive() external payable {}
}
