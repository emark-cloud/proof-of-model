// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Escrow
/// @notice Per-request fee escrow skeleton. Phase 2 fills deposit/release/refund logic,
///         applies the protocol cut, and integrates with ChallengeManager's finalize window.
contract Escrow {
    /// @dev Protocol fee taken from each released payment (basis points).
    uint256 public constant PROTOCOL_CUT_BPS = 500; // 5%

    address public immutable owner;

    /// @dev requestId → ETH amount held pending delivery confirmation.
    mapping(bytes32 => uint256) public deposits;

    event Deposited(bytes32 indexed requestId, address indexed buyer, uint256 amount);
    event Released(bytes32 indexed requestId, address indexed provider, uint256 amount);
    event Refunded(bytes32 indexed requestId, address indexed buyer, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Lock ETH for a pending inference request.
    /// @dev Phase 1 skeleton: release()/refund() are not yet implemented, so accepting
    ///      ETH here would permanently lock it on the live deployment. Reverts until
    ///      Phase 2 wires the full deposit/release/refund flow (validate requestId
    ///      uniqueness, record buyer for refund path, apply protocol cut).
    function deposit(bytes32 /*requestId*/) external payable {
        revert("Escrow: not implemented (Phase 2)");
    }

    /// @notice Release escrowed ETH to provider after confirmed delivery.
    /// @dev Phase 2: apply PROTOCOL_CUT_BPS, send protocol cut to owner,
    ///      enforce ChallengeManager finalize window before releasing.
    function release(bytes32 requestId, address provider) external {
        uint256 amount = deposits[requestId];
        require(amount > 0, "Escrow: nothing to release");
        deposits[requestId] = 0;
        // Phase 2: uint256 cut = amount * PROTOCOL_CUT_BPS / 10_000; transfer remainder to provider.
        emit Released(requestId, provider, amount);
    }

    /// @notice Refund buyer if provider fails to deliver within the finalize window.
    /// @dev Phase 2: verify caller is authorized (buyer or ChallengeManager), transfer ETH.
    function refund(bytes32 requestId, address buyer) external {
        uint256 amount = deposits[requestId];
        require(amount > 0, "Escrow: nothing to refund");
        deposits[requestId] = 0;
        // Phase 2: transfer amount back to buyer.
        emit Refunded(requestId, buyer, amount);
    }
}
