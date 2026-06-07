# Stylus Verifier (`proof-verifier`)

The deep-engineering core: Poseidon-Merkle proof verification + per-node
fixed-point recompute along a sampled output→input path → PASS/FAIL.

## Build / test / deploy

Requires the Rust toolchain + `cargo-stylus` (pinned to `rust-toolchain.toml`,
channel 1.91.0, `wasm32-unknown-unknown`). From this directory:

```bash
cargo test                # native unit tests (fixed-point + golden fixtures)
cargo stylus check        # validate the WASM is deployable
cargo stylus deploy --endpoint <arbitrum-sepolia-rpc> --private-key $PRIVATE_KEY
```

The Poseidon path and toolchain here mirror the Phase-0 spike, which compiled to
valid Stylus WASM, deployed to Arbitrum Sepolia, and matched the circom oracle
3/3 (~110k gas). See `phase0-spike-results.md`.

## Invariants

- Fixed-point Q-format (`src/fixed.rs`) and Poseidon params MUST match
  `packages/shared` exactly — divergence silently breaks every equality check.
- Golden known-good / known-bad fixtures from `packages/model` are the contract;
  assert them here once Phase 1 produces them.
