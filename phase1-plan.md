# Phase 1 — Reference model + verifier core (implementation plan)

Status: planning. Owner: —. Target: end of Week 1 (per `spec.md` milestones).

Phase 1 builds the two load-bearing pieces of the protocol: the **TS reference net**
(`packages/model`) that produces the committed trace and openings, and the **Stylus
Verifier** (`packages/stylus`) that recomputes a sampled output→input path and returns
PASS/FAIL. It also expands `packages/contracts` (Registry + Staking, skeletons for the
Phase-2 game) and deploys the Verifier + Registry to Arbitrum Sepolia.

The model is the **contract** for everything downstream: its golden known-good /
known-bad fixtures are what the Stylus verifier, the contracts, and (later) the agents all
assert against. So the model lands first and fully; the verifier is coded against it.

---

## 0. What already exists (Phase 0 / 0.5 — do not rebuild)

- `packages/shared` — locked invariants, the single source of truth:
  - `fixed-point.ts`: `FRAC_BITS=16`, `SCALE=65536`, `Fixed = bigint`, `toFixed/fromFixed`,
    `dotBiasShift(weights, acts, bias)`, `arithShiftRight`, `relu`, `identity`.
  - `poseidon.ts`: `FIELD_MODULUS` (BN254 scalar), `POSEIDON_T=3`, `toField(x)`,
    `POSEIDON_GOLDEN` (3 vectors, verified 3/3 across TS/Rust/Sol in Phase 0).
  - `network.ts`: `LAYER_SIZES=[3,8,4,2]`, `MAX_WIDTH=8`, `NUM_WEIGHT_LAYERS=3`,
    `ACTIVATIONS=["relu","relu","identity"]`, `PATH_LENGTH=3`.
  - `addresses.ts`: `CHAINS` (arbitrumSepolia 421614, arbitrumOne 42161), `ADDRESSES` (all null).
  - `abis/`: `IVerifier.json` (`verifyPath(bytes32,bytes32,bytes)→bool`), `Registry.json`.
- `packages/model` — scaffold only: `forward()` throws "not implemented (Phase 1)";
  `InferenceResult { trace, output }`; `SHAPE`. Dep: `poseidon-lite`.
- `packages/stylus` — Poseidon path proven and wired (`poseidon2`, exposed as `hash2`);
  `fixed.rs` mirrors the TS Q-format (`dot_bias_shift`, `relu`, `identity`); `verify_path`
  is a stub returning `false`. **`cargo` is NOT installed in this env** — all
  `cargo build/check/test/stylus` steps are gated to a Rust machine / CI.
- `packages/contracts` — Foundry; `Registry.register(bytes32)` + `ProviderRegistered`
  event + 2 passing tests; `IVerifier` interface; `Deploy.s.sol` deploys Registry.
- `spikes/poseidon-stylus` — the proven Poseidon contract (deployed Sepolia
  `0x299c9ba8…64f8`, ~110k gas), library code identical to the verifier's `poseidon2`.

---

## 1. Design decisions to lock in Phase 1 (cross-language invariants)

These four are new invariants that, like the Q-format and Poseidon params, MUST be
byte-for-byte identical in TS and Rust (and Solidity where it touches them). They belong
in `packages/shared` as the single source of truth, with the same "do not diverge"
warning the existing files carry. **Settle these before writing the prover.**

### 1.1 Deterministic weights (the model definition)

The net needs fixed, reproducible weights. Generate them deterministically from a frozen
seed so anyone can regenerate H_w, but freeze the resulting values as a checked-in golden
artifact (`packages/model/src/weights.ts` or `.json`).

- Scheme: for each weight/bias scalar, derive a field element via
  `Poseidon(seed, globalIndex)` (reusing our hash — no new primitive), map it into a small
  signed range, and `toFixed`-encode. Proposed range: weights in `[-1, 1)`, biases in
  `[-0.5, 0.5)`, quantized to Q47.16. Concretely: `raw = poseidon2(SEED, idx) mod 2^17`;
  `signed = raw - 2^16`; `w = signed` (already a Q47.16 i64 in `[-1, 1)` since SCALE=2^16).
  `SEED` is a fixed constant recorded in `shared`.
- Rationale for the range: keeps ReLU active on both sides (some neurons fire, some don't —
  a flat-zero net would make the cheat trivially undetectable), and keeps the i128
  accumulator far from overflow (≤8 products of two `<1.0` Q47.16 values).
- The verifier never sees the full weight set — only opened rows + Merkle path — so the
  generator can live in `model`. But the **encoding of a scalar into a field element**
  (§1.3) and the **leaf layout** (§1.2) are shared invariants.

### 1.2 Merkle commitments — leaf ordering and tree shape

Both trees are **binary Merkle trees** over `poseidon2(left, right)` (our proven 2-input
compression). Padding leaves are the field element `0`; pad up to the next power of two.
Parent = `poseidon2(child0, child1)` with the lower-index child as `left`. Single-leaf
trees: root = the leaf. Define these once in `shared` (`merkle.ts`) so TS builds them and
Rust verifies against the identical layout.

**Trace root R** — commits every activation in the trace, layer-major:
- Leaf for neuron `(layer, i)` = `feltFromFixed(activation[layer][i])` (§1.3). Activations
  are committed raw (one leaf per scalar), not pre-hashed — the verifier needs to open
  individual parent activations and the node activation.
- Leaf index = canonical flatten: `offset(layer) + i`, where `offset` is the running sum of
  `LAYER_SIZES` (input acts at indices 0..2, layer1 at 3..10, layer2 at 11..14, output at
  15..16). Total 17 leaves → pad to 32.
- A function `traceLeafIndex(layer, i)` lives in `shared` and is the one truth both sides use.

**Weight root H_w** — commits each node's incoming weight row + bias:
- Leaf for output-node `(L, j)` (L ∈ {1,2,3}) = a **sub-commitment** of its parameters:
  `rowLeaf(L,j) = poseidonMany([w_{j,0}, …, w_{j,K-1}, bias_j])` where K = `LAYER_SIZES[L-1]`,
  each scalar via `feltFromFixed`. `poseidonMany` = a fixed left-fold:
  `acc = felt[0]; for k in 1..: acc = poseidon2(acc, felt[k])` (define once in `shared`;
  document it as the row-commit rule). This lets one Merkle opening reveal a whole row+bias
  plus its path, and the verifier recomputes `rowLeaf` from the opened row to check the path.
- Leaf index = canonical flatten over nodes excluding the input layer:
  `weightLeafIndex(L, j)` for L=1 (8 nodes), L=2 (4), L=3 (2) → 14 leaves, pad to 16.
- `H_w` is what the provider registers on-chain (`Registry.register(H_w)`) and what the
  Verifier is handed as `weightRoot`.

### 1.3 Signed-i64 (Q47.16) → field element encoding

Activations and weights are signed i64; Merkle leaves are field elements. The map must be
canonical and identical in TS/Rust:

```
feltFromFixed(x: i64) -> field:
    x >= 0  ->  x
    x <  0  ->  FIELD_MODULUS + x      // two's-complement value folded into the field
```

i.e. `((x mod FIELD) + FIELD) mod FIELD` using big-int / field arithmetic. Lives in
`shared/poseidon.ts` (or `fixed-point.ts`) as `feltFromFixed` with a Rust twin in
`fixed.rs`. The verifier recomputes an activation as i64, applies `feltFromFixed`, and
compares the resulting field element to the opened leaf — so the encoding is the equality
surface; getting it wrong silently fails every check.

### 1.4 `pathProof` calldata layout (the prover↔verifier wire format)

`verify_path(trace_root: U256, weight_root: U256, path_proof: Vec<u8>)`. Use a **hand-rolled
fixed-layout big-endian byte buffer** (not Solidity ABI) — it's the simplest thing both
`openPath` (TS, emits) and the Rust verifier (decodes) can agree on, and it's
self-describing from `LAYER_SIZES`. All field elements / fixed values serialize as 32-byte
big-endian words.

Proposed layout (one segment per node on the path, output→input, 3 nodes for this net):

```
[ pathLen : u8 ]                              // = 3 (sanity; derivable from shared)
for each node t in path (layer L = 3, 2, 1):
    [ nodeIndex_j        : u8 ]               // which neuron at layer L
    [ nodeActivation     : 32B ]              // a_j  (Q47.16 as field via feltFromFixed)
    [ bias_j             : 32B ]
    [ K = LAYER_SIZES[L-1] ]                  // implicit from shared, not serialized
    [ weightRow[0..K]    : K * 32B ]          // incoming weights w_{j,i}
    [ parentActs[0..K]   : K * 32B ]          // full parent-layer activations a_i
    [ wMerklePathLen : u8 ][ siblings : n*32B ]   // path of rowLeaf(L,j) to weight_root
    [ wMerkleDirs    : packed bits/bytes ]        // left/right at each level
    [ aMerkleProofs for nodeActivation and each parentAct ... ]   // see note
```

Activation Merkle proofs: the verifier must confirm `nodeActivation` and **every**
`parentAct[i]` are the committed leaves under `trace_root` (otherwise a cheat could feed
fake parent acts that recompute correctly). Two options, decide in implementation:
- (A) Include a Merkle path for each opened activation leaf (simplest, more calldata).
- (B) Since consecutive path nodes share a layer (node t's `parentActs` ⊃ node t+1's
  `nodeActivation`), reuse openings across segments to cut redundancy.

Start with (A) for correctness and clarity (calldata size is not the Phase-1 win — the gas
benchmark is about the recompute/hash, Phase 3); note (B) as an optimization. Document the
exact final layout as a comment block in both `openPath` and the Rust decoder, and add a
round-trip test (TS encodes → bytes → a TS decoder mirror asserts equality) so the wire
format is pinned before Rust consumes it.

---

## 2. Work breakdown

Ordered by dependency. ✅ = lands in this phase. Items touching `cargo` are **CI-gated**
(no Rust toolchain in this env) — code them, test what's possible locally, run
`cargo test` / `cargo stylus check` / deploy on the Rust machine.

### 2.1 `packages/shared` — new invariants (do first)
1. `feltFromFixed` (+ inverse if useful) in `fixed-point.ts` or `poseidon.ts`; unit-tested
   against hand cases incl. negatives.
2. `merkle.ts`: `poseidonMany(felts)`, `merkleRoot(leaves)`, `merkleProof(leaves, index)`,
   `verifyMerkleProof(leaf, proof, root)`, `traceLeafIndex(layer,i)`, `weightLeafIndex(L,j)`,
   padding rules. Pure TS (uses `poseidon-lite` via existing dep pattern).
3. Freeze `WEIGHT_SEED` constant + document the §1.1 generation scheme.
4. Tests: Merkle root/proof round-trips; `poseidonMany` reproduces a hand-rolled fold;
   leaf-index maps cover all neurons with no collisions.

### 2.2 `packages/model` — reference net + commitments + openings (the contract)
1. `weights.ts`: deterministic generator (§1.1) + frozen golden weights artifact;
   `weightRoot(): bytes32` builds H_w from the row-leaf layout (§1.2).
2. `forward(input: Fixed[]): InferenceResult` — loop layers 0→3, per neuron
   `dotBiasShift(row, parentActs, bias)` then `φ` (`relu` for layers 1–2, `identity` for 3).
   Returns full `trace` (incl. input layer as `trace[0]`) and `output`.
3. `commit(trace): bytes32` — trace root R from the activation-leaf layout (§1.2).
4. `openPath(ρ: PathSpec): PathProof` where `PathSpec = { output: j3, h2: j2, h1: j1 }`
   (one neuron index per non-input layer; the random walk that picks them is the
   challenger's job in Phase 2 — Phase 1 takes an explicit spec + a `samplePath(rngSeed)`
   helper for fixtures). Produces the §1.4 bundle: per node activation, weight row+bias,
   full parent acts, and all Merkle proofs (trace + weight). Add `encodePathProof(bundle):
   Uint8Array` (the §1.4 byte layout) and a `decodePathProof` mirror for the round-trip test.
5. Export types: `PathSpec`, `PathProof`, plus `feltFromFixed` re-export if convenient.
6. **Golden fixtures** (`packages/model/src/fixtures.ts` + a generated JSON consumed by
   Rust tests): a canonical input vector → its `R`, `H_w`, `output`, and for a fixed
   `PathSpec` the full encoded `pathProof` bytes (hex). Two fixtures:
   - **known-good**: honest trace; verifier must PASS.
   - **known-bad**: corrupt exactly one neuron's activation in `trace` (the Phase-2
     "cheat" — flip one hidden node), rebuild R over the corrupted trace, keep real H_w;
     for a path through the corrupted node the recompute ≠ opened activation → verifier
     must FAIL. Document that a path *not* through the corrupt node passes (the ~1/N bound
     — this is the soundness story, not a bug).
7. Tests: `forward` determinism + hand-checked small case; R/H_w stable across runs;
   `verifyMerkleProof` accepts every opening in a good bundle; corrupting a leaf breaks it;
   encode→decode round-trip equality.

### 2.3 `packages/stylus` — the Verifier core (CI-gated build)
1. `fixed.rs`: add `felt_from_fixed(i64) -> U256` twin of §1.3; keep `dot_bias_shift` etc.
   as-is (already mirrors TS).
2. `merkle` (new module or in `lib.rs`): `verify_merkle_proof(leaf, siblings, dirs, root)`
   using `poseidon2`; `poseidon_many(&[U256])` left-fold (twin of `poseidonMany`).
3. Decode `path_proof` per §1.4 into per-node structs (`nodeIndex`, `activation`, `bias`,
   `weightRow`, `parentActs`, merkle proofs). Pure byte parsing — validate `pathLen` and
   slice lengths against `LAYER_SIZES`.
4. `verify_path` body — for each node on the path:
   - verify `nodeActivation` leaf ∈ trace_root at `traceLeafIndex(L, j)`;
   - verify each `parentActs[i]` leaf ∈ trace_root at `traceLeafIndex(L-1, i)`;
   - recompute `rowLeaf = poseidon_many([weightRow.., bias])`, verify it ∈ weight_root at
     `weightLeafIndex(L, j)`;
   - recompute `z = dot_bias_shift(weightRow, parentActs, bias)`, `a = φ_L(z)`,
     assert `felt_from_fixed(a) == nodeActivation`.
   Any failed Merkle check or mismatch → `return false`. All pass → bump `verified_count`,
   `return true`. (Keep it `view`-compatible per `IVerifier`; the counter write may need a
   separate non-view path — confirm against the ABI: `verifyPath` is `view returns bool`,
   so do the count bump in the Phase-2 ChallengeManager call path, not here. Verifier stays
   pure.)
5. Unit tests (`#[cfg(test)]`) that load the §2.2 golden JSON: known-good → `true`,
   known-bad → `false`; also re-assert `POSEIDON_GOLDEN` 3/3 (regression guard).
6. CI-gated: `cargo test`, `cargo stylus check`, then **deploy Verifier to Arbitrum
   Sepolia** (`cargo stylus deploy`). Record the address.

### 2.4 `packages/contracts` — Registry + Staking, game skeletons
1. Expand `Registry` to ERC-8004-style register + stake + reputation:
   - `Provider { bytes32 weightRoot; uint256 stake; bool active; uint64 served; uint64
     challenged; uint64 slashed; }` (reputation counters; mutated by ChallengeManager later).
   - keep `register(bytes32 weightRoot) payable`; add `IVerifier` address wiring (constructor
     or setter) so Phase 2 can call it.
   - add minimal stake floor / withdraw guard if cheap; keep slashing in ChallengeManager.
2. `ChallengeManager.sol` **skeleton** — constructor takes `IVerifier` + `Registry`;
   defines the finalize-window + challenge entrypoints as stubs with events
   (`ChallengeOpened`, `Verified`, `Slashed`, `BountyPaid`); the real slash/bounty logic is
   Phase 2. Goal: compile, deploy, lock the interface the agents code against.
3. `Escrow.sol` **skeleton** — per-request fee accounting stub + protocol-cut field; Phase 2
   fills it. (Or fold into ChallengeManager if cleaner — decide at implementation.)
4. Tests: keep the 2 Registry tests green; add reputation-field default + verifier-wiring
   tests; a ChallengeManager construction test.
5. `forge build && forge test`; run `scripts/sync-abis.ts` so updated ABIs (Registry,
   IVerifier, ChallengeManager) land in `packages/shared/src/abis` (CI checks staleness).
6. **Deploy Registry (+ skeletons) to Arbitrum Sepolia** via `Deploy.s.sol` (extend it to
   wire the deployed Verifier address into Registry/ChallengeManager).

### 2.5 `packages/shared` — record deployments
- After §2.3/§2.4 deploys, fill `ADDRESSES.arbitrumSepolia` (`Verifier`, `Registry`,
  `ChallengeManager`). Commit. (arbitrumOne stays null until Phase 3 migrate.)

---

## 3. Ordering & critical path

```
shared invariants (2.1)
        │
        ▼
model: forward → commit/H_w → openPath → encode + GOLDEN FIXTURES (2.2)   ◀── the contract
        │                                   │
        ▼                                   ▼
stylus verifier coded against fixtures   contracts Registry+skeletons (2.4)
(2.3, decode→merkle→recompute)            (independent; can parallelize)
        │                                   │
        ▼ (CI/Rust machine)                 ▼
   cargo test + stylus check          forge test + sync-abis
        │                                   │
        ▼                                   ▼
   deploy Verifier → Sepolia          deploy Registry → Sepolia
        └──────────────┬────────────────────┘
                       ▼
            record addresses in shared (2.5)
```

`2.4 contracts` has no dependency on the model and can proceed in parallel with `2.2/2.3`.
The TS work (`2.1`, `2.2`) is fully doable in this environment. The Rust verifier (`2.3`)
can be **written** here but only **built/tested/deployed** on a Rust machine — so structure
it to be reviewable from the fixtures alone, and treat green `cargo test` against the
golden JSON as the Phase-1 verifier acceptance gate.

---

## 4. Acceptance criteria (Phase 1 "done")

- [ ] `pnpm build:ts` + all TS tests green, including new `shared` (merkle, felt) and
      `model` (forward/commit/openPath/round-trip/fixtures) suites.
- [ ] Golden **known-good** and **known-bad** fixtures exist as both TS and a generated
      JSON, with `R`, `H_w`, `output`, and an encoded `pathProof` hex for each.
- [ ] Stylus `verify_path` fully implemented; `cargo test` PASS on known-good=true /
      known-bad=false and `POSEIDON_GOLDEN` 3/3; `cargo stylus check` clean.
- [ ] Verifier deployed to Arbitrum Sepolia; on-chain `verifyPath` returns the same
      PASS/FAIL as the local Rust test on the fixture bytes (one live call each way).
- [ ] Registry (with stake + reputation fields + verifier wiring) and ChallengeManager/
      Escrow skeletons compile, `forge test` green, ABIs synced, deployed to Sepolia.
- [ ] `ADDRESSES.arbitrumSepolia` populated for Verifier + Registry (+ ChallengeManager).
- [ ] TODO.md Phase-1 boxes checked; cross-language invariants (felt encoding, merkle
      layout, proof wire format) documented in `shared` with the "do not diverge" warning.

---

## 5. Risks & mitigations

- **Cross-language drift** (the project's stated #1 risk). Mitigation: every new invariant
  lands in `shared` first with a Rust twin in the same PR; golden JSON fixtures are the
  shared oracle; Rust tests load the *same* JSON the TS emits.
- **No Rust toolchain locally.** Mitigation: keep the verifier reviewable from fixtures;
  gate cargo steps to CI/Rust machine; don't block TS work on them. (Phase-0 already proved
  the Poseidon path compiles + runs on Stylus.)
- **`verifyPath` is `view` but we want a liveness counter.** Resolution: keep the Verifier
  pure (no state write); do the `verified_count`/event emission in the Phase-2
  ChallengeManager call path. Confirmed against `IVerifier.json` (`view returns bool`).
- **Signed→field + arithmetic-shift edge cases** (negatives, floor-toward-−∞). Mitigation:
  explicit negative-value tests on both sides; reuse the existing `dotBiasShift` hand case
  (0.25 = 0.5·2 + (−1)·1 + 0.25) and add a negative-output case.
- **Calldata size of option (A) full Merkle proofs.** Acceptable for Phase 1 (correctness
  first; gas benchmark is Phase 3). Note option (B) opening-reuse as the optimization.
- **Honesty (per CLAUDE.md).** The known-bad fixture must demonstrate the ~1/N bound
  truthfully: document that a path missing the corrupt node passes, and that multi-sample
  is what drives detection up — don't oversell single-path soundness.

---

## 6. Out of scope for Phase 1 (deferred)

Agents (provider/buyer/challenger), x402 money loop, real slash/bounty logic in
ChallengeManager (skeleton only here), the dashboard, the gas benchmark, and the Arbitrum
One migrate — all Phase 2/3. Real/non-deterministic LLMs, tolerance-band commitments, and
interactive bisection remain roadmap (stated proudly per `spec.md`).
