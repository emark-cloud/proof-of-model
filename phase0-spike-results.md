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

**2026-06-10 run attempt — code verified, funded, credentialed; blocked on network egress to Coinbase.**

Done (all green):
- ✅ Verified every import in both scaffolds resolves against installed `@x402/* 2.14.0`.
- ✅ **Fixed 2 real bugs in `x402-client.mjs`** that would have crashed the buyer:
  1. used `x402HTTPClient().register(...)` — but in v2.14.0 `.register()` lives on `x402Client`
     (the canonical pattern `wrapFetchWithPayment` documents); `x402HTTPClient` only wraps one.
  2. local `const URL = …` shadowed the global `URL`, breaking the dotenv path resolution (TDZ).
- ✅ Server route config + `paymentMiddleware(routes, server)` signature match v2.14.0.
- ✅ `.env` wiring: secrets stay in root `.env` (CDP keys + `DEPLOYER_KEY`); `spikes/.env` holds
  non-secret config; both scripts load root `.env` via `config({ path: ../.env })`.
- ✅ **Funding confirmed:** buyer = `DEPLOYER_KEY` wallet `0x2a30…05B6A` holds **2.05 USDC** on
  Arbitrum One (self-pay: `PAY_TO` = same wallet). No ETH needed.
- ✅ **CDP keys present + well-formed** in root `.env` (ID 36 chars, secret 88 chars — Ed25519).
- ✅ Server boots clean; facilitator config → `https://api.cdp.coinbase.com/platform/v2/x402`.

**Transient blocker (resolved):** this WSL2 network silently dropped TCP SYN to every Coinbase
**API** host (`api.cdp.coinbase.com` etc.) — upstream firewall/geo, not our tooling (docs +
other Cloudflare hosts resolved fine; persisted with the Bash sandbox disabled). **Fixed by
routing through a Proton WireGuard tunnel** (`sudo wg-quick up proton-wg-v4.conf`, US exit
`159.26.100.219`). After that, `api.cdp.coinbase.com` → HTTP 200 and `getSupported()` returns
**24 kinds including `eip155:42161`** (Arbitrum One). ✅

**Self-pay gotcha:** with `payTo == buyer` the facilitator rejects the EIP-3009 transfer with
`self_send_not_allowed`. Fixed by setting `PAY_TO` to a distinct address (provider-honest wallet
`0xe6Fd…E6bC`); buyer stays the `DEPLOYER_KEY` wallet that holds the USDC.

### ✅ GO — live x402 settlement on Arbitrum One (2026-06-10)

Real paid `GET /hello` → HTTP 200, USDC settled on-chain by the CDP facilitator (buyer paid **no
ETH** — facilitator sponsored gas):

| field | value |
|---|---|
| settlement tx | `0xaa38f38ac3e8d3936592fe4fd007a68b36f7faad106c7a0e1896ce56dc53d3a6` (block 471967645) |
| further txs | `0x96bb7d59b2ff892f9c83e819527686a250b784d87d9c3e67de980f8177f482c8` (turnkey re-run) |
| buyer (payer) | `0x2a30…05B6A` (`DEPLOYER_KEY`), gasless |
| payTo (provider) | `0xe6Fd…E6bC` — received **0.02 USDC** across the runs |
| facilitator (gas payer) | `0x68a96f41ff1e9f2e7b591a931a4ad224e7c07863` (CDP) |
| asset / amount | native USDC `0xaf88…5831`, `10000` = $0.01/call |
| gasUsed | 86,708 |

Buyer USDC `2.050996 → 2.030996` (−$0.02); provider `0 → 0.02`. Confirms the full x402 loop:
buyer signs EIP-3009, CDP facilitator verifies + settles + sponsors gas, USDC moves on Arbitrum One.

**Turnkey:** `node x402-server.mjs`, then (new shell) `node x402-client.mjs` — prints the
settlement tx + Arbiscan link. Requires the tunnel up and `PAY_TO != buyer`.

---

## Go/no-go (task 4)
- **Poseidon: GO** (this doc).
- **x402: GO — live on-chain settlement confirmed on Arbitrum One** (tx above). Scaffold verified,
  wallet funded, CDP keys working, gasless EIP-3009 settlement proven. Fallbacks if ever needed:
  self-hosted facilitator (x402.rs), or the minimal escrow rail (already live on Sepolia, Phase 2).
