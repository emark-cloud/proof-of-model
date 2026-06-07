# Phase 0 — Paper Review & Plan Confirmation

**Source:** `Offchain-Labs-paper.pdf` — Anchuri, Campanelli, Cesaretti, Gennaro, Jois, Kayman, Ozdemir,
*"Towards Verifiable AI with Lightweight Cryptographic Proofs of Inference"* (eprint 2026/541; to appear IEEE SaTML 2026).
Read in full (49 pp, incl. all appendices). Date: 2026-06-07.

> TODO Phase 0, task 1: *"confirm trace-commit + spot-check model; correct plan if needed."* — This is that confirmation, plus **one significant correction**.

---

## TL;DR

- ✅ **The paradigm is confirmed.** Commit to the inference execution trace via a Merkle/vector commitment, spot-check a small random sample of the trace against the committed weights, slash provable inconsistencies. This is exactly Arbitrum's optimistic, sampling-based fraud-proof logic applied to ML inference. Our bet, our category-rejection, and the "heavy verification math in Stylus" framing all hold.
- ⚠️ **One correction (important):** the paper's actual spot-check is a **random *path* from output → input (RandPathTest)**, *not* a single isolated neuron. The single-neuron check we currently specify is literally the paper's **`RandTestStrawman`**, which it introduces and then **rejects**. We should adopt the path-based check. It's faithful to the cited paper, strictly more sound, and still cheap on our 4-layer net (≈3 local checks). See §2.
- ✅ Several of our "roadmap" items are validated *and given a concrete construction* by the paper: interactive bisection = the **refereed model, Appendix D** (O(log n) rounds, hash-chained trace); non-determinism / tolerance bands = the open "full soundness for LLMs" problem.
- ℹ️ **Hashing:** the paper itself uses **SHA-256** for its Merkle tree, not Poseidon. Our Poseidon choice is *our* call (for the Stylus-benchmark story) — fine, but note the paper does not require it, so the Keccak fallback (decision #2) loses nothing in fidelity-to-paper terms.

---

## 1. What the paper actually specifies (and how it maps to us)

| Paper | Us (spec.md / CLAUDE.md) | Status |
|---|---|---|
| Trained model `M`; weights committed once via vector commitment `C_M`, the "ground truth," computed honestly at end of training | `H_w` (weight root) | ✅ same thing |
| Prover computes `trc = EvalTrace(M, qry)` = vector of **all** activation values, one per neuron, ordered by layer with public wiring; commits via Merkle-based VC `C_trc` | activation trace → Merkle root `R` | ✅ same thing |
| Prover returns `out = M(qry)` + `C_trc` | output + `R` on-chain | ✅ same |
| Verifier sends random challenge `ρ`; runs **RandPathTest** | challenger samples random neuron `(L,j)`, demands opening | ⚠️ **see §2** |
| Local consistency check at each node: `ã_j == φ(Σ_{i∈G_j} w_ij · ã_i)`, weights from `C_M`, parent activations from `C_trc` | recompute one neuron in fixed-point, assert equality | ✅ the per-node check is identical; the **sampling shape** differs |
| Two commitments opened at the sampled positions; verify VC openings, then run local checks | Merkle proofs vs `R` and `H_w`, then recompute | ✅ same |

**Soundness story (paper's, stated honestly — matches our ethos):**
- *Other-model soundness* (the paper's main, formally-treated notion): adversary runs a **different** model `M̃` and commits `M̃`'s **honest** trace. Detected because functionally-dissimilar models have representationally-dissimilar traces ("trace separation," Thm 1). **This is exactly our "model substitution" threat.** Empirically validated on ResNet-18 and Llama-2-7B (min separation 0.05–0.07, well above noise).
- *Strong other-model soundness*: runs `M̃` but **forges** the trace arbitrarily. The paper's gradient-descent, inverse-transform, and logit-swap attacks **all fail** to forge a passing trace (§7, Apps E/F). ReLU specifically helps — its information loss at negatives defeats inverse reconstruction.
- *Full soundness* (arbitrary output + arbitrary trace): **open problem.** Crucially: **any single-path strategy has a detection bound of `1/N`** (N = max layer width) when the cheat is concentrated in one node. **Mitigation: sample multiple independent paths.** → This is the precise, paper-grounded justification for our **"single-round, multi-sample"** MVP and honesty table.

---

## 2. The correction: path-based check, not single-neuron

Our current spec (spec.md §2; CLAUDE.md "How verification works"; TODO `openNeuron(L,j)`, "single-neuron fixed-point recompute") describes opening **one isolated neuron** `(L,j)` and recomputing it.

**That is the paper's `RandTestStrawman` (p.6), which the paper explicitly rejects:**

> *"discrepancies in the activations typically manifest in 'late' layers. This makes `RandTestStrawman` susceptible to false positives, as a random check in an early layer will likely pass even if the final output is different. Furthermore, while internal activations can be manipulated by an adversary, the input layer remains an immutable anchor."*

The paper's fix — **`RandPathTest`** (Figs 1, 3; Final Protocol Fig 4) — samples a **connected path from a random output neuron back to the input layer**, checking local consistency at each node, where each next sampled node is chosen **among the parents** of the current one. Anchoring at the output and walking to the immutable input is what gives the test its teeth.

**Why this matters for us specifically:**
- **Fidelity.** We cite this paper as our intellectual foundation and lead with an honesty narrative. Shipping the paper's named strawman as "our protocol" is exactly the credibility hit the StarkVerifier-2.1× lesson warns against.
- **Soundness.** For our demo cheat ("corrupt one neuron"), a single-neuron sample only catches it if it happens to land on the corrupted neuron, and the strawman critique (early-layer checks pass vacuously) bites. The path test catches any output-affecting cheat with much better probability and a clean theoretical bound (`1/N` per path, ↑ with multi-path — which we already plan as "multi-sample").
- **Cost.** Our net is `3→8→4→2` (4 layers). A path is **3 local checks** (output→h2→h1→input), opening the sampled node + its full parent layer each step: about `2+4+8+3` activation openings + 3 weight rows. Trivially on-chain-feasible in Stylus — and a **richer, more interesting gas benchmark** (more Poseidon hashing + 3 dot products) than a single neuron. Net positive for the Stylus deliverable.

**Concrete API change:** `openNeuron(L,j)` → `openPath(ρ)` returning, for the sampled path, each node's activation + weight-row + bias + the full parent-layer activations, with Merkle proofs against `R` and `H_w`. The Stylus verifier loops the per-node check (which is unchanged) over the path and asserts all hold. Per-node fixed-point recompute logic is identical to what we planned — only the sampling wrapper and the proof-bundle shape grow.

This is a **proposed change to a "locked"/core area** (CLAUDE.md "don't break this" + spec.md §2), so I'm flagging it for your decision rather than rewriting those docs unilaterally. Recommendation: **adopt path-based.**

---

## 3. Roadmap items — validated and given constructions

- **Interactive multi-round bisection (our headline roadmap)** = the paper's **refereed model, Appendix D.** Two provers make competing claims; bisect the topologically-sorted trace in **O(log n)** rounds to localize the first disagreeing node, then check that one node `a_{i,ℓ} = Σ φ(w·a)`. Uses a **hash-chained trace** `A_{i,k} = [a_{i,k}, H(a_{i,0..k-1})]`. We can cite Appendix D directly when we describe bisection as roadmap — it's the same Arbitrum fraud-proof game (it cites Arbitrum [KGC+18] / Optimism). The roadmap claim is real and well-founded.
- **Non-deterministic / real LLMs (tolerance-band commitments)** = the paper's open **"full soundness for LLMs"** problem + its note that quantized/rounding models are an exploit surface. Our "roadmap, not MVP" framing is exactly right and now citable.
- **Multi-path sampling** to tighten the `1/N` bound = paper's own stated mitigation and future work. Our "multi-sample" is on-paradigm.

## 4. Smaller confirmations / notes for the build

- **Activation φ:** use **ReLU** for the fixed-point net. The paper's evidence is that ReLU's info-loss at negatives is what defeats the inverse-transform forgery attack (sigmoid was invertible and *did* leak). Good for our soundness story; keep ReLU in the shared params.
- **Bias:** paper folds bias as a weight on a constant-1 activation (footnote 3); we carry `b[L][j]` explicitly. Either is fine — just keep it **identical across TS/Rust/Solidity** (our critical invariant).
- **Architecture is public** (wiring known to both sides); only weights + activations are committed. Matches our design. Footnote 9: the trace commitment implicitly must be "on a model with the same architecture" — automatic for our fixed `3→8→4→2`.
- **Randomness / challenge ρ:** in the interactive protocol `ρ` is the verifier's fresh challenge. Non-interactive (on-chain) Fiat-Shamir over a "holographic" check "requires care... non-negligible soundness error [CD24]" (Conclusion). For MVP, the **challenger agent picks the path off-chain and submits it** — fine; just don't oversell it as trustless randomness. VRF/commit-reveal is a hardening item, not MVP.
- **Performance framing (for honesty table / benchmark intro):** their paradigm vs zkLLM — zkLLM: prove 388.3 s, proof 183 kB, verify 2.36 s. Theirs: commit 5.8 ms, proof ≈3.4 MB, verify 12.44 ms. I.e. *orders-of-magnitude faster prover, bigger proofs, cheap verify.* Our Stylus-vs-Solidity gas table measures a **different axis** (on-chain verify cost), but the "lightweight, verify is cheap" narrative is consistent and reinforced.
- **Hashing:** paper uses **SHA-256** (row-wise Merkle). Poseidon is **our** choice for the Stylus benchmark; nothing in the paper requires it, and the Keccak fallback is equally faithful. Good to know for the go/no-go (task 4): if Poseidon-under-Stylus is painful, falling back costs us nothing in paper-fidelity — only in benchmark punch.

---

## 5. Net effect on the plan

**No change to the core bet, architecture, money loop, agent design, or honesty framing — all confirmed.** One substantive correction (single-neuron → path-based spot-check) and a set of citations that *strengthen* the roadmap and honesty sections. If the path change is accepted, the doc/code edits are:
- `spec.md §2`, `CLAUDE.md` "How verification works" + Architecture bullets: single-neuron → RandPathTest (output→input path; per-node check unchanged).
- `TODO.md` Phase 1: `openNeuron(L,j)` → `openPath(ρ)`; "single-neuron recompute" → "per-node recompute along sampled path."
- `packages/model` and `packages/stylus` API: `openNeuron` → `openPath`; verifier loops the (unchanged) per-node check.

---

## 6. Status of the other Phase 0 tasks

| Task | Status | Blocker |
|---|---|---|
| 1. Read paper + confirm/correct | ✅ done (this doc) | — |
| 2. Poseidon-under-Stylus spike | ⛔ not started | **Rust + cargo-stylus not installed**; deploy step needs a funded Arbitrum Sepolia key. Toolchain install can proceed now; on-chain deploy needs a key. |
| 3. x402 CDP facilitator spike | ⛔ not started | Needs **CDP API keys** + funded testnet USDC wallet. |
| 4. Go/no-go (Poseidon, x402) | ⛔ blocked | depends on 2 + 3 |

Env check: `node v20`, `pnpm 9.15`, `forge 1.5.1`, `foundryup 1.6.1` present. `rustc`/`cargo`/`cargo-stylus` **missing**.
