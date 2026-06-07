// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVerifier} from "./interfaces/IVerifier.sol";

/// @title Registry
/// @notice ERC-8004-style provider registry: register model weight root, post stake,
///         accrue reputation counters. Slashing is driven by ChallengeManager via the
///         Stylus Verifier. Phase 2 adds challenge-window withdraw guard and slash routing.
contract Registry {
    /// @dev Minimum stake a provider must bond on registration.
    uint256 public constant MIN_STAKE = 0.001 ether;

    struct Provider {
        bytes32 weightRoot; // H_w of the model this provider commits to run
        uint256 stake; // bonded collateral, slashable on a proven cheat
        bool active;
        uint64 served; // inference requests confirmed delivered
        uint64 challenged; // times challenged
        uint64 slashed; // times stake was slashed
    }

    /// @notice The Stylus Verifier wired at deploy time (queried by ChallengeManager).
    IVerifier public immutable verifier;

    address public immutable owner;
    /// @notice ChallengeManager address — set once via setManager after its deploy.
    address public manager;

    mapping(address => Provider) public providers;

    event ProviderRegistered(address indexed provider, bytes32 indexed weightRoot, uint256 stake);
    event ProviderWithdrew(address indexed provider, uint256 amount);
    event ManagerSet(address indexed manager);

    modifier onlyManager() {
        require(msg.sender == manager, "Registry: caller is not manager");
        _;
    }

    constructor(address verifier_) {
        verifier = IVerifier(verifier_);
        owner = msg.sender;
    }

    /// @notice Wire the ChallengeManager address. Callable once by owner after deployment.
    function setManager(address manager_) external {
        require(msg.sender == owner, "Registry: not owner");
        require(manager == address(0), "Registry: manager already set");
        manager = manager_;
        emit ManagerSet(manager_);
    }

    /// @notice Register as a provider committing to model `weightRoot`, bonding msg.value.
    function register(bytes32 weightRoot) external payable {
        require(weightRoot != bytes32(0), "Registry: zero weightRoot");
        require(!providers[msg.sender].active, "Registry: already registered");
        require(msg.value >= MIN_STAKE, "Registry: below min stake");
        providers[msg.sender] = Provider({
            weightRoot: weightRoot,
            stake: msg.value,
            active: true,
            served: 0,
            challenged: 0,
            slashed: 0
        });
        emit ProviderRegistered(msg.sender, weightRoot, msg.value);
    }

    /// @notice Withdraw full stake and deregister. Phase 2 adds challenge-window lock.
    function withdraw() external {
        Provider storage p = providers[msg.sender];
        require(p.active, "Registry: not registered");
        uint256 amount = p.stake;
        require(amount > 0, "Registry: nothing to withdraw");
        p.stake = 0;
        p.active = false;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Registry: transfer failed");
        emit ProviderWithdrew(msg.sender, amount);
    }

    /// @notice Convenience view: weight root for a provider (avoids full tuple destructuring).
    function weightRootOf(address provider) external view returns (bytes32) {
        return providers[provider].weightRoot;
    }

    // ─── Manager-gated reputation + slash functions ──────────────────────────

    /// @notice Increment a provider's served counter (called by ChallengeManager on delivery).
    function recordServed(address provider) external onlyManager {
        providers[provider].served += 1;
    }

    /// @notice Increment a provider's challenged counter when a challenge is opened.
    function recordChallenged(address provider) external onlyManager {
        providers[provider].challenged += 1;
    }

    /// @notice Slash up to `amount` from a provider's stake, forwarding funds to manager.
    /// @return actual Amount actually slashed (capped at available stake).
    function slash(address provider, uint256 amount) external onlyManager returns (uint256 actual) {
        Provider storage p = providers[provider];
        actual = amount > p.stake ? p.stake : amount;
        p.stake -= actual;
        p.slashed += 1;
        if (p.stake == 0) p.active = false;
        if (actual > 0) {
            (bool ok,) = manager.call{value: actual}("");
            require(ok, "Registry: slash transfer failed");
        }
    }
}
