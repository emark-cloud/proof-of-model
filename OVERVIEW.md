# Proof-of-Model

**A verifiable-inference marketplace for the agent economy, on Arbitrum (Stylus + Solidity).**

## The problem
When an agent pays a provider for model inference, it gets back an output and a bill — and no way to check either. A provider can **bill for a frontier model and serve a cheap 7B** (model substitution), or return an output that doesn't actually match `input + claimed model` (output integrity).

zk-proving every inference is possible but slow and expensive. The cheaper paradigm is **optimistic verification**: the provider commits to the inference's execution trace, a verifier opens only a few randomly sampled positions, and a provable inconsistency slashes a staked bond — Arbitrum's own fraud-proof logic applied to ML inference. Proof-of-Model is the missing trust rail: **the verification layer for paid agent inference, not a compute provider.**

## How verification works
Treat an inference as a deterministic feed-forward computation over committed weights. The model's weights are fixed and committed by hash `H_w`; for each request the provider runs the model, builds the full **activation trace**, commits it as a Poseidon-Merkle root `R`, and returns `output + R` on-chain.

**The spot-check (`RandPathTest`).** A challenger picks a random *output* neuron and walks a random path back to the immutable input layer, demanding an opening for every node `(L, j)` on the path:
- the node's activation `a[L][j]` — Merkle proof against `R`,
- its weight row + bias — proofs against `H_w`,
- the full parent-layer activations `a[L-1][*]` — proofs against `R`.

The on-chain **Stylus verifier** checks all the proofs and recomputes `a[L][j] == φ(Σᵢ w[L][j][i]·a[L-1][i] + b[L][j])` in fixed-point at every node, asserting each holds → **PASS / FAIL**. A provider serving a cheaper model produces a trace inconsistent with `H_w` along the path and is caught.

**Why a path, not one neuron.** Opening a single neuron is the paper's rejected `RandTestStrawman` — discrepancies concentrate in late layers, so an early-layer check passes vacuously even when the output is wrong. Anchoring at a random output neuron and tracing back to the immutable input gives the test its soundness: to pass while serving a cheap output, a provider would have to produce a trace consistent with `H_w` along *every* sampled path — i.e. actually run the real model. A single path bounds detection of a one-node cheat at `~1/N` (`N` = max layer width); **multi-sample** raises it. (Interactive bisection — the paper's `O(log N)` refereed model — is roadmap.) Follows Offchain Labs, *"Towards Verifiable AI with Lightweight Cryptographic Proofs of Inference"* (SaTML 2026).

## Why a deterministic small model
Exact-equality recompute **requires determinism**. Real LLMs are non-deterministic (floating point, sampling, hardware variance), so they break exact-equality checks. The MVP uses a small **fixed-point deterministic net** (`3→8→4→2`, Q-format i64). This is a scope choice, not a weakness — **the product is the verification mechanism, not the model size.** LLM support via tolerance-band commitments is roadmap.

## Packages (pnpm monorepo)
| Package | Role |
|---|---|
| `packages/model` | TS reference net — fixed-point inference, Poseidon-Merkle trace (`R`), weight root (`H_w`), `openPath(ρ)` proof bundles. Source of the golden good/bad fixtures every other package asserts against. |
| `packages/stylus` | Rust/Stylus **Verifier** — Merkle-proof verification + per-node fixed-point recompute along the path. The deep-engineering core. |
| `packages/contracts` | Solidity — Registry+Staking (ERC-8004-style), ChallengeManager (calls the Verifier), Escrow/Fee. |
| `packages/agents` | Provider (honest + cheat flag), buyer (x402), challenger. |
| `packages/dashboard` | Next.js **read-only** spectator UI. |
| `packages/shared` | ABIs, addresses, fixed-point + Poseidon params — **single source of truth** (must be identical across TS, Rust, Solidity, or every equality check silently breaks). |

## Ecosystem benefit
Not zkML, not a decentralized-compute marketplace. We **commit the trace, spot-check random openings, and slash provable cheats** — Arbitrum's optimistic fraud-proof paradigm applied to inference. It addresses the Arbitrum Foundation's "the agent economy has a verification problem" priority and gives **x402 + ERC-8004** the missing trust layer for paid inference.
