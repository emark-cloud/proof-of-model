// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Escrow
/// @notice Per-request fee escrow — the on-chain money spine for the Phase-2 E2E
///         on Sepolia (the documented fallback to the x402 rail). The buyer locks
///         a fee against a `requestId`; on finalize the ChallengeManager releases
///         it to the provider minus the protocol cut; on a proven slash it refunds
///         the buyer.
/// @dev release/refund are manager-gated and move real ETH, so they follow
///      checks-effects-interactions and are reentrancy-guarded. deposit reverts on a
///      duplicate requestId so funds can't be silently overwritten.
contract Escrow {
    /// @dev Protocol fee taken from each released payment (basis points).
    uint256 public constant PROTOCOL_CUT_BPS = 500; // 5%

    address public immutable owner;
    /// @notice ChallengeManager address — set once via setManager after its deploy.
    address public manager;

    struct Dep {
        address buyer;
        uint256 amount;
    }

    /// @dev requestId → escrowed deposit (buyer + amount) held pending resolution.
    mapping(bytes32 requestId => Dep) public deposits;

    event ManagerSet(address indexed manager);
    event Deposited(bytes32 indexed requestId, address indexed buyer, uint256 amount);
    event Released(bytes32 indexed requestId, address indexed provider, uint256 amount, uint256 protocolCut);
    event Refunded(bytes32 indexed requestId, address indexed buyer, uint256 amount);

    modifier onlyManager() {
        require(msg.sender == manager, "Escrow: caller is not manager");
        _;
    }

    // ─── Minimal reentrancy guard ─────────────────────────────────────────────
    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1, "Escrow: reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Wire the ChallengeManager address. Callable once by owner after deployment.
    function setManager(address manager_) external {
        require(msg.sender == owner, "Escrow: not owner");
        require(manager == address(0), "Escrow: manager already set");
        manager = manager_;
        emit ManagerSet(manager_);
    }

    /// @notice Lock ETH for a pending inference request. `msg.sender` is the buyer
    ///         recorded for the refund path.
    function deposit(bytes32 requestId) external payable {
        require(msg.value > 0, "Escrow: zero deposit");
        require(deposits[requestId].amount == 0, "Escrow: requestId used");
        deposits[requestId] = Dep({buyer: msg.sender, amount: msg.value});
        emit Deposited(requestId, msg.sender, msg.value);
    }

    /// @notice Release escrowed ETH to the provider after a confirmed delivery,
    ///         taking the protocol cut for the owner.
    function release(bytes32 requestId, address provider) external onlyManager nonReentrant {
        Dep memory d = deposits[requestId];
        require(d.amount > 0, "Escrow: nothing to release");
        delete deposits[requestId];

        uint256 cut = d.amount * PROTOCOL_CUT_BPS / 10_000;
        uint256 payout = d.amount - cut;

        if (cut > 0) {
            (bool okCut,) = owner.call{value: cut}("");
            require(okCut, "Escrow: cut transfer failed");
        }
        (bool okPay,) = provider.call{value: payout}("");
        require(okPay, "Escrow: payout transfer failed");

        emit Released(requestId, provider, payout, cut);
    }

    /// @notice Refund the recorded buyer when a provider is slashed for cheating.
    /// @dev The buyer is read from the stored deposit — never passed in — so a
    ///      refund can only ever reach the address that actually paid.
    function refund(bytes32 requestId) external onlyManager nonReentrant {
        Dep memory d = deposits[requestId];
        require(d.amount > 0, "Escrow: nothing to refund");
        delete deposits[requestId];

        (bool ok,) = d.buyer.call{value: d.amount}("");
        require(ok, "Escrow: refund transfer failed");

        emit Refunded(requestId, d.buyer, d.amount);
    }
}
