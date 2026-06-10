# Phase 2 — E2E run log (Arbitrum Sepolia)

The two reproducible end-to-end runs that are the Phase-2 acceptance artifact (§2.3):
the **honest path** (PASS → fee released) and the **cheat path** (FAIL → slash + bounty
+ refund). Both run against live Sepolia with real tx hashes.

Run date: 2026-06-09. Explorer: https://sepolia.arbiscan.io

## Deployed addresses (current)

| Contract | Address |
|---|---|
| Verifier (Stylus) | `0xe19dfd6abae5b0b815dd6b3d8f90126fe68b79ae` |
| Registry | `0x35198835f689e05bB363f09472360b5D9a44711b` |
| ChallengeManager | `0xc3135c7DbB5EcB87a4F99a538318d968079e96A3` |
| Escrow | `0x6149f5fB00ec427727e67DD51E7278ED0Bf553cd` |

`finalizeWindow = 30s` (short demo window; mainnet would use e.g. 1 day).

## Agent accounts (generated, funded from deployer)

| Role | Address |
|---|---|
| provider:honest | `0xe6Fd606719c10F6fE268cF1AE5D99cBA43BCE6bC` |
| provider:cheat | `0xAa7fB65060aE5082354DdCD40FCCCf208c1EF0B0` |
| buyer | `0x652Ad290efA2858e67F0698Bd68ebAce473aec45` |
| challenger | `0x8EaA6b3f8e6e5abCf8C9499f02E719a016C81DbC` |

## Happy path (`pnpm e2e:happy`) — honest provider PASS → fee released

requestId `0x792c483e73f416b271b45afe2b839a0dac46c2b506abf9380883c606472381ff`

| Step | Tx |
|---|---|
| buyer deposit (escrow) | `0x66a0707167a535e9267355a9b1d18cfc82b37270d60b9217866ffbb00baf38ea` |
| provider commit R | `0x0a49c95ea06f627436ed6eef4b70968e4041355f0ba4aeebf80feb894a31de31` |
| finalize → release | `0x4f3a18fba8cf50e1a67ce8a44b8376515b6fa0bae8e03f87b97c6f6919e1d9c9` |

Challenger sampled 64 paths via `eth_call verifyPath` — all PASS → no challenge.
Released: payout 0.000019 ETH + protocol cut 0.000001 ETH (5%). `served 0 → 1`.

## Cheat path (`pnpm e2e:cheat`) — cheater FAIL → slash + bounty + refund

requestId `0x685756bc0869510efcf8b47cd6091fa78f89f89969d39e30f9e08cc417cea981`

| Step | Tx |
|---|---|
| buyer deposit (escrow) | `0x05bfadac873b22ce4fb1533a68e51445608b9c5347d11ec5272a78508cc78a92` |
| provider commit corrupt R | `0x0eb56589e1e557582cb580bfaa15a0ca7ee4d55b42f90bac3bd2840b267acd90` |
| openChallenge | `0xc85728686654417792d3717a1f06ad01c3c3120edb8e4fa4cc9bcc596d092585` |
| resolveChallenge → slash | `0xe429796d0f6000a082997d672f88cbc8bb89b56e4e06263dd33c207c50dafac4` |

Challenger found a failing path at sample #1 (routed through the corrupt node).
On-chain `verifyPath` returned false → full stake slashed (0.001 ETH), 10% bounty
(0.0001 ETH) to challenger, buyer refunded 0.00002 ETH. `slashed 0 → 1`, provider
deactivated (stake → 0).

## Notes / deviations from the plan

- **Stylus verifier was redeployed** (plan §0 assumed "no cargo" / "Verifier stays
  as-is" — but `cargo-stylus` is present). Two issues surfaced and were fixed:
  1. The original deploy (`0xd46e…a057`) predated the `168e10e` leaf-position fix.
  2. **Root cause:** Rust `verify_path(U256, U256, Vec<u8>)` was exposed by Stylus as
     `verifyPath(uint256,uint256,uint8[])`, whose selector mismatched `IVerifier`'s
     `verifyPath(bytes32,bytes32,bytes)` — every call reverted (latent: `cargo test`
     calls the inner fn directly and never crossed the ABI boundary). Fixed by typing
     the params `FixedBytes<32>` / `abi::Bytes`. Verified known-good→true /
     known-bad→false through the real `IVerifier.json` ABI before the E2E.
- **The Solidity stack was redeployed** wired to the new verifier: `ChallengeManager`
  holds `verifier` as `immutable`, and `Registry`/`Escrow` managers are set-once, so
  repointing required a fresh Registry + Escrow + ChallengeManager.
- Earlier abandoned state on the *old* stack (one Pending honest commit, one stuck
  Challenged cheat commit, ~0.001 ETH stake locked per provider in the old Registry)
  is harmless testnet dust and was left as-is.
