# Proof-of-Model

Verifiable-inference marketplace for the agent economy on Arbitrum (Stylus + Solidity).
Providers commit to *which model they ran* (Merkle root of the activation trace), buyers
pay per call via x402, challengers spot-check a random output→input path and slash provable
cheats — Arbitrum's optimistic, sampling-based fraud-proof paradigm applied to ML inference.

## Locked decisions
- Hash: **Poseidon** (Merkle commitments + Stylus benchmark story).
- Payments: **x402-first** (Coinbase CDP facilitator); minimal escrow only as fallback.
  Phase-0 finding: the **CDP hosted facilitator does NOT support Arbitrum Sepolia** (testnets:
  Base/World Sepolia + Solana Devnet only). Decision: run the **x402 payment rail on Arbitrum
  One mainnet** (`eip155:42161`, CDP-supported) with real-but-tiny USDC (free <1000 tx/mo);
  buyer signs EIP-3009, facilitator settles + sponsors gas. Self-host-on-Sepolia and escrow
  are the documented fallbacks.
- Chains: **Arbitrum only** — Stylus verifier + contracts dev on **Sepolia**; the **x402 rail is
  Arbitrum One** (CDP has no Sepolia support). Final migrate → One. No Robinhood Chain.
- **MVP-shipped status (decision 2026-06-11):** the MVP **ships complete on Arbitrum Sepolia** —
  the **escrow rail** is the demonstrated on-chain money spine (both honest-PASS and cheat-SLASH
  paths reproduce live). The **Arbitrum One migrate + integrated x402 live-run are descoped to
  roadmap** (no mainnet spend); x402 itself was proven in the Phase-0 spike. The stack is kept
  One-ready as a single-env flip (`PROOF_CHAIN`/`NEXT_PUBLIC_CHAIN`). So "x402-first / final
  migrate → One" above is the **production intent**, not the shipped MVP. See `phase3-plan.md` §2.7.
- Model: deterministic **3→8→4→2** fixed-point net (Q-format i64). NOT a real LLM — by design.
- Verification: **single-round, multi-sample** spot-check. The sample is a **random output→input
  path (RandPathTest, per the paper)**, not a single isolated neuron — the single-neuron check is the
  paper's rejected `RandTestStrawman`. Interactive bisection (paper's refereed model, App. D) is roadmap.
- Repo: pnpm **monorepo**. Name stays **Proof-of-Model**.

## Architecture
- `packages/model` — TS reference net: deterministic fixed-point inference, Poseidon-Merkle
  trace (root R), weight root H_w, and openPath(ρ) producing the verifier's proof bundle for a
  random output→input path (each node's activation + weight row + bias + full parent-layer acts).
- `packages/stylus` — Rust/Stylus **Verifier**: Poseidon Merkle-proof verification +
  per-node fixed-point recompute looped along the sampled path + assert equality → PASS/FAIL.
  The deep-engineering core.
- `packages/contracts` — Solidity: Registry+Staking (ERC-8004-style), ChallengeManager
  (calls Verifier), Escrow/Fee.
- `packages/agents` — provider (honest + cheat flag), buyer (x402), challenger (sample→open→verify→challenge).
- `packages/dashboard` — Next.js spectator UI (read-only). See `design.md`.
- `packages/shared` — generated ABIs, deployed addresses, fixed-point + Poseidon params (single source of truth).
- `scripts/` — deploy, seed, `verify.ts` (judge path), benchmark.

## How verification works (don't break this)
The verifier samples a **random path from a random output neuron back to the immutable input
layer** (RandPathTest). At each node on the path it recomputes `a_j = φ(Σ w_ij·a_i)` using the
**committed real weights from H_w** and the **opened parent activations from R**, then asserts
the opened node activation matches — looping this same per-node check along the whole path.
Anchoring at the output and walking to the input is essential: a single isolated-neuron check
(the paper's `RandTestStrawman`) passes vacuously in early layers even when the output is wrong.
A provider serving a cheaper model produces a trace inconsistent with H_w along the path → caught.
Per the paper, a single path bounds detection of a one-node cheat at ~1/N (N = max layer width);
**multi-sample (multiple independent paths)** drives it up — hence "multi-sample." To pass while
serving a cheap output, a provider would have to produce a trace consistent with H_w along every
sampled path — i.e. actually run the real model. That's the soundness.

## Critical invariants
- Fixed-point Q-format and Poseidon parameters MUST be identical across TS, Rust, and Solidity.
  They live once in `packages/shared`. Divergence silently breaks every equality check.
- Golden known-good / known-bad fixtures from `packages/model` are the contract for the verifier;
  assert them in every package's tests.
- The dashboard is **read-only re: the protocol** — a human cannot participate: no
  "Submit Challenge", no manual slash, no tx-sending from the browser (that would break the
  agentic story). **One deliberate exception (decision 2026-06-11):** a **demo launcher**
  (`components/DemoControl.tsx` + `/api/demo/*`) that starts/stops the *off-chain agent driver*
  so a visitor can kick off the show and understand it. It spawns `scripts/demo-driver.ts`
  server-side (keys stay in the repo `.env`, never reach the client); the agents still do all
  protocol work. The control is NOT a protocol action — keep it that way.
- Be honest in all docs/demo: MVP = deterministic toy model + single-round check; LLMs and
  bisection are roadmap. Ship the honest result (the StarkVerifier 2.1× lesson).

## Tooling / commands
- Solidity: Foundry (`forge build`, `forge test`).
- Stylus: `cargo stylus` (build/check/deploy); test against golden fixtures.
- Workspace: pnpm. Dashboard deploy: Vercel.
- Networks: Arbitrum Sepolia (dev), Arbitrum One (final). RPC/faucets in `resources.md`.

## References
- Specs: `spec.md` (scope/MVP), `design.md` (dashboard), `resources.md` (links/faucets/RPC).
- StarkVerifier (Poseidon/Merkle Stylus + gas benchmark), RayStylus (fixed-point on-chain net).
- ERC-8004 (identity), x402 (`@coinbase/x402`, `x402-express`, `@x402/evm`).

## Out of scope for MVP (state proudly)
Real/non-deterministic LLMs (tolerance-band commitments), interactive multi-round bisection,
large challenger swarm (1–2 only), hardened x402 facilitator + economic tuning.
