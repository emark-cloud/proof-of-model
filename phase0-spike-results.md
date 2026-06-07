# Phase 0 — Spike Results (de-risk)

Date: 2026-06-07. Wallet `0x2a3080AA52DE07702dd30b81cC97C3527e605B6A`.

## Spike 2 — Poseidon under Stylus/WASM ✅ GO

**Question:** does the production-path Poseidon (circom-compatible, BN254) compile to valid
Stylus WASM, deploy to Arbitrum Sepolia, and produce the *same* digest as the off-chain
reference? (resources.md flagged this as "the main unknown.")

**Setup:** `spikes/poseidon-stylus/` — a Stylus contract exposing `hash2(a,b)` / `commit2(a,b)`
using **`light-poseidon` 0.3 over `ark-bn254` / `ark-ff` 0.5** (arkworks). `new_circom(2)`,
so it must equal circomlib Poseidon(2). Off-chain oracle: `poseidon-lite` (`spikes/poseidon-ref.mjs`).

**Results:**
- ✅ Compiles to `wasm32-unknown-unknown` — **no `getrandom` problem** (the usual arkworks-on-wasm
  blocker did not materialize with arkworks 0.5 + `default-features = false`). Raw wasm 91 KB.
- ✅ `cargo stylus check` passes — **24.4 KB brotli-compressed** (within the Stylus on-chain limit),
  wasm data fee ≈ 0.000124 ETH.
- ✅ Deployed + activated on **Arbitrum Sepolia**:
  - contract `0x299c9ba83ac2d5f80401e61709eb24cc8ec864f8`
  - deploy tx `0x490eb0a26349a3b2c15060338125821755b2cbdcee6c435d2d22955a8232e18b`
  - activation tx `0x07934dd07ff20bce347f22b19ddc18949696ee720237a8a3becf329d9cab4891`
- ✅ **On-chain digest == off-chain circom oracle, 3/3 vectors:**
  | input | digest |
  |---|---|
  | `hash2(1,2)` | `0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a` |
  | `hash2(0,0)` | `0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864` |
  | `hash2(poseidon(1,2),42)` | `0x0d19f766383a61c3e253f742367666002931a039d818c9c491eb3f918342f3b5` |
- ⛽ Gas: `hash2` view ≈ **109,555**; `commit2` (one Poseidon + storage write) ≈ **129,745**.

**Implications for the build:**
- Decision #2 (Poseidon, Keccak fallback) → **stay Poseidon.** No WASM blocker; benchmark story intact.
- The shared Poseidon params = **circomlib BN254 t=3** (`new_circom` in Rust ↔ `poseidon-lite`/`poseidon2`
  in TS). This is the single source of truth for the critical cross-impl invariant. The Solidity
  side must match the same circom Poseidon.
- One single Poseidon ≈ 110k gas. A full RandPathTest verify (3 layers × Merkle openings + per-node
  recompute) is many Poseidon hashes but clearly on-chain-feasible, and a *rich* Stylus-vs-Solidity
  gas benchmark (Solidity Poseidon has no precompile → expensive → the headline gap).

**Toolchain:** rustc 1.96 host; project pins 1.91.0 (`rust-toolchain.toml`); cargo-stylus 0.10.7.
Deploy gotcha: pass `--max-fee-per-gas-gwei 0.2` (default underbid the Sepolia base fee ~0.02 gwei).

---

## Spike 3 — x402 CDP facilitator ⏳ pending funding

**Phase-0 finding:** the **CDP hosted facilitator does NOT support Arbitrum Sepolia** (testnets:
Base Sepolia, World Sepolia, Solana Devnet only). Decision (user): run the **x402 rail on
Arbitrum One mainnet** (`eip155:42161`, CDP-supported) with real-but-tiny USDC. Free <1000 tx/mo.

**Setup (ready):** `spikes/` — `x402-server.mjs` (seller, `@x402/express` + `@coinbase/x402`
`facilitator`, $0.01/call, native USDC `0xaf88…5831`, `payTo` = our wallet) and `x402-client.mjs`
(buyer, `@x402/fetch` + viem account, EIP-3009 signature). Deps installed: `@x402/* 2.14.0`,
`@coinbase/x402 2.1.0`, viem 2.52.

**Blocker:** fund the buyer wallet with **~$1–2 native USDC on Arbitrum One**. No ETH needed
(facilitator settles + sponsors gas). Then: run seller, run buyer, capture the settlement tx.

---

## Go/no-go (task 4)
- **Poseidon: GO** (this doc).
- **x402: pending** the funded run on Arbitrum One. Fallbacks if it disappoints: self-hosted
  facilitator on Sepolia, or minimal escrow.
