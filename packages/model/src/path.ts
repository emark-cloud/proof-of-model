/**
 * Path prover: openPath(ρ) → PathProof, plus wire-format encode/decode.
 *
 * A PathProof is the verifier's input for a single RandPathTest sample: one node
 * per non-input layer (output→h2→h1), carrying the opened activation, weight row+bias,
 * full parent-layer activations, and Merkle proofs for all of them.
 *
 * Wire format (§1.4 of phase1-plan.md, option A — full proof per activation leaf):
 *
 *   [ pathLen : u8 ]              // = PATH_LENGTH = 3
 *   for each node t in [L=3, L=2, L=1]:
 *     [ nodeIndex_j    : u8 ]
 *     [ nodeActivation : 32B ]    // feltFromFixed(a_j), big-endian
 *     [ bias_j         : 32B ]    // feltFromFixed(bias), big-endian
 *     [ weightRow[K]   : K×32B ]  // feltFromFixed each; K = LAYER_SIZES[L-1]
 *     [ parentActs[K]  : K×32B ]  // feltFromFixed each
 *     [ wProofLen  : u8 ][ wSiblings : n×32B ][ wDirs : n×u8 ]
 *     for each activation in [nodeAct, parentAct[0], …, parentAct[K-1]]:
 *       [ aProofLen : u8 ][ aSiblings : m×32B ][ aDirs : m×u8 ]
 *
 * All field elements serialize as 32-byte big-endian. Sibling/dir arrays are
 * bottom-up (leaf level first). wProofLen = 4 (weight tree depth, 14→16 pad);
 * aProofLen = 5 (trace tree depth, 17→32 pad). Option B (open-reuse across
 * segments) is a Phase-3 optimization — not implemented here.
 *
 * CRITICAL INVARIANT: this layout MUST match the Rust decoder in
 * packages/stylus/src/verifier.rs. The round-trip test pins it.
 */

import {
  poseidon2,
  feltFromFixed,
  poseidonMany,
  merkleRoot,
  merkleProof,
  verifyMerkleProof,
  traceLeafIndex,
  weightLeafIndex,
  LAYER_SIZES,
  PATH_LENGTH,
  type Fixed,
  type MerkleProof,
} from "@proof/shared";
import { WEIGHTS, BIASES, rowLeaf } from "./weights.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Specifies a random output→input path: one neuron index per non-input layer. */
export type PathSpec = {
  output: number; // layer 3 neuron index (0..1)
  h2: number;     // layer 2 neuron index (0..3)
  h1: number;     // layer 1 neuron index (0..7)
};

/** Per-node data and Merkle proofs for one step on the path. */
export type PathNodeProof = {
  layer: number;
  nodeIndex: number;
  nodeActivation: bigint;      // feltFromFixed(a_j)
  bias: bigint;                // feltFromFixed(bias_j)
  weightRow: bigint[];         // feltFromFixed each w_{j,i}
  parentActs: bigint[];        // feltFromFixed each a_i (full parent layer)
  weightProof: MerkleProof;    // rowLeaf(L,j) in H_w
  nodeActProof: MerkleProof;   // a_j in R
  parentActProofs: MerkleProof[]; // each a_i in R
};

/** Full proof bundle output by openPath; input to the Stylus verifier. */
export type PathProof = {
  traceRoot: bigint;
  weightRoot: bigint;
  nodes: PathNodeProof[]; // [L=3, L=2, L=1] — output→input
};

// ---------------------------------------------------------------------------
// samplePath — deterministic path sampler for tests/fixtures
// ---------------------------------------------------------------------------

/**
 * Deterministically sample a PathSpec from a seed using Poseidon.
 * The challenger uses a random seed derived from on-chain randomness in Phase 2;
 * Phase 1 uses this for fixture generation.
 */
export function samplePath(rngSeed: bigint): PathSpec {
  return {
    output: Number(poseidon2(rngSeed, 0n) % BigInt(LAYER_SIZES[3]!)),
    h2: Number(poseidon2(rngSeed, 1n) % BigInt(LAYER_SIZES[2]!)),
    h1: Number(poseidon2(rngSeed, 2n) % BigInt(LAYER_SIZES[1]!)),
  };
}

// ---------------------------------------------------------------------------
// openPath — the prover
// ---------------------------------------------------------------------------

/** Build the full trace leaf array (feltFromFixed each activation). */
function buildTraceLeaves(trace: Fixed[][]): bigint[] {
  const total = LAYER_SIZES.reduce((a: number, b: number) => a + b, 0); // 17
  const leaves: bigint[] = Array.from({ length: total }, () => 0n);
  for (let layer = 0; layer < trace.length; layer++) {
    for (let i = 0; i < trace[layer]!.length; i++) {
      leaves[traceLeafIndex(layer, i)] = feltFromFixed(trace[layer]![i]!);
    }
  }
  return leaves;
}

/** Build the full weight leaf array (rowLeaf each node). */
function buildWeightLeaves(): bigint[] {
  const leaves: bigint[] = Array.from({ length: 14 }, () => 0n);
  for (let L = 1; L <= 3; L++) {
    for (let j = 0; j < LAYER_SIZES[L]!; j++) {
      leaves[weightLeafIndex(L, j)] = rowLeaf(L, j);
    }
  }
  return leaves;
}

/**
 * Open the output→input path specified by `spec` over `trace`.
 * Returns the full PathProof bundle including all Merkle proofs.
 * The trace may be an honest or corrupt trace — openPath is data-agnostic;
 * correctness is the verifier's job.
 */
export function openPath(
  spec: PathSpec,
  trace: Fixed[][],
  traceRoot: bigint,
  hwRoot: bigint
): PathProof {
  const traceLeaves = buildTraceLeaves(trace);
  const weightLeaves = buildWeightLeaves();

  const nodeIndices = [spec.output, spec.h2, spec.h1]; // [L=3, L=2, L=1]
  const layers = [3, 2, 1];

  const nodes: PathNodeProof[] = layers.map((L, t) => {
    const j = nodeIndices[t]!;
    const parentLayer = L - 1;
    const K = LAYER_SIZES[parentLayer]!;

    const nodeActivation = feltFromFixed(trace[L]![j]!);
    const bias = feltFromFixed(BIASES[L - 1]![j]!);
    const weightRow = WEIGHTS[L - 1]![j]!.map(feltFromFixed);
    const parentActs = trace[parentLayer]!.map(feltFromFixed);

    const weightProof = merkleProof(weightLeaves, weightLeafIndex(L, j));
    const nodeActProof = merkleProof(traceLeaves, traceLeafIndex(L, j));
    const parentActProofs = Array.from({ length: K }, (_, i) =>
      merkleProof(traceLeaves, traceLeafIndex(parentLayer, i))
    );

    return {
      layer: L,
      nodeIndex: j,
      nodeActivation,
      bias,
      weightRow,
      parentActs,
      weightProof,
      nodeActProof,
      parentActProofs,
    };
  });

  return { traceRoot, weightRoot: hwRoot, nodes };
}

// ---------------------------------------------------------------------------
// Wire-format encode / decode
// ---------------------------------------------------------------------------

/** Serialize a bigint as a 32-byte big-endian byte array. */
function feltTo32BE(felt: bigint): number[] {
  const out: number[] = new Array(32);
  let x = felt;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Serialize a MerkleProof as: [ len: u8, siblings: len×32B, dirs: len×u8 ]. */
function encodeProof(buf: number[], proof: MerkleProof): void {
  buf.push(proof.siblings.length);
  for (const s of proof.siblings) buf.push(...feltTo32BE(s));
  for (const d of proof.dirs) buf.push(d);
}

/** Encode the full PathProof into the §1.4 wire format. */
export function encodePathProof(proof: PathProof): Uint8Array {
  const buf: number[] = [];

  buf.push(proof.nodes.length); // pathLen = PATH_LENGTH = 3

  for (const node of proof.nodes) {
    buf.push(node.nodeIndex);
    buf.push(...feltTo32BE(node.nodeActivation));
    buf.push(...feltTo32BE(node.bias));
    for (const w of node.weightRow) buf.push(...feltTo32BE(w));
    for (const a of node.parentActs) buf.push(...feltTo32BE(a));
    encodeProof(buf, node.weightProof);
    encodeProof(buf, node.nodeActProof);
    for (const ap of node.parentActProofs) encodeProof(buf, ap);
  }

  return new Uint8Array(buf);
}

/** Decode a §1.4 wire-format buffer back into a PathProof. Mirror of encodePathProof. */
export function decodePathProof(
  bytes: Uint8Array,
  traceRoot: bigint,
  hwRoot: bigint
): PathProof {
  let off = 0;

  function readU8(): number {
    return bytes[off++]!;
  }

  function readFelt(): bigint {
    let v = 0n;
    for (let i = 0; i < 32; i++) v = (v << 8n) | BigInt(bytes[off++]!);
    return v;
  }

  function readProof(): MerkleProof {
    const len = readU8();
    const siblings: bigint[] = Array.from({ length: len }, readFelt);
    const dirs: number[] = Array.from({ length: len }, readU8);
    return { siblings, dirs };
  }

  const pathLen = readU8();
  const nodes: PathNodeProof[] = [];

  for (let t = 0; t < pathLen; t++) {
    const L = 3 - t; // t=0→L=3, t=1→L=2, t=2→L=1
    const K = LAYER_SIZES[L - 1]!;

    const nodeIndex = readU8();
    const nodeActivation = readFelt();
    const bias = readFelt();
    const weightRow: bigint[] = Array.from({ length: K }, readFelt);
    const parentActs: bigint[] = Array.from({ length: K }, readFelt);
    const weightProof = readProof();
    const nodeActProof = readProof();
    const parentActProofs: MerkleProof[] = Array.from({ length: K }, readProof);

    nodes.push({ layer: L, nodeIndex, nodeActivation, bias, weightRow, parentActs, weightProof, nodeActProof, parentActProofs });
  }

  return { traceRoot, weightRoot: hwRoot, nodes };
}
