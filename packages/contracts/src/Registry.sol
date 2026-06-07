// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Registry
/// @notice ERC-8004-style provider registry + staking (SCAFFOLD — Phase 1 fills this in).
/// @dev Providers register the model they commit to (weight root H_w), post stake,
///      and accrue reputation. Slashing is driven by ChallengeManager via the
///      Stylus Verifier (see TODO.md Phase 1). This is a compiling skeleton only.
contract Registry {
    struct Provider {
        bytes32 weightRoot; // H_w of the model this provider claims to run
        uint256 stake; // bonded collateral, slashable on a proven cheat
        bool active;
    }

    mapping(address => Provider) public providers;

    event ProviderRegistered(address indexed provider, bytes32 indexed weightRoot, uint256 stake);

    /// @notice Register as a provider committing to model `weightRoot`, bonding msg.value.
    /// @dev Skeleton: no reputation, withdrawal, or slashing yet (Phase 1).
    function register(bytes32 weightRoot) external payable {
        require(weightRoot != bytes32(0), "Registry: zero weightRoot");
        require(!providers[msg.sender].active, "Registry: already registered");
        providers[msg.sender] =
            Provider({weightRoot: weightRoot, stake: msg.value, active: true});
        emit ProviderRegistered(msg.sender, weightRoot, msg.value);
    }
}
