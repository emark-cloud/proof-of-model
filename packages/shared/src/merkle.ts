/**
 * Merkle tree utilities — SINGLE SOURCE OF TRUTH.
 *
 * CRITICAL INVARIANT: leaf ordering, padding, and tree shape defined here MUST be
 * reproduced byte-for-byte in packages/stylus/src/merkle.rs. Any divergence silently
 * breaks every Merkle proof verified on-chain. Do not change without updating both sides.
 *
 * Tree rules:
 *   - Binary Merkle tree over poseidon2(left, right) (our proven 2-input compression).
 *   - Leaves are padded to the next power of two with field element 0n.
 *   - Parent = poseidon2(child0, child1) with the lower-index child as `left`.
 *   - Single-leaf trees: root = the leaf (no hashing).
 */

import { poseidon2 } from "./poseidon.js";
import { LAYER_SIZES } from "./network.js";

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/** Fixed left-fold Poseidon hash over an arbitrary number of field elements.
 *  acc = felts[0]; for k in 1..: acc = poseidon2(acc, felts[k])
 *  This is the row-commit function: rowLeaf = poseidonMany([w0,..,wK-1, bias]).
 */
export function poseidonMany(felts: readonly bigint[]): bigint {
  if (felts.length === 0) throw new Error("poseidonMany: empty input");
  let acc = felts[0]!;
  for (let k = 1; k < felts.length; k++) {
    acc = poseidon2(acc, felts[k]!);
  }
  return acc;
}

/** Smallest power of two >= n (minimum 1). */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ---------------------------------------------------------------------------
// Merkle tree
// ---------------------------------------------------------------------------

/** Build a complete binary Merkle tree and return the root. Leaves are padded to
 *  the next power of two with 0n. Single-leaf input returns the leaf unchanged. */
export function merkleRoot(leaves: readonly bigint[]): bigint {
  if (leaves.length === 0) throw new Error("merkleRoot: empty leaves");
  const n = nextPowerOfTwo(leaves.length);
  let layer: bigint[] = Array.from({ length: n }, (_, i) =>
    i < leaves.length ? leaves[i]! : 0n
  );
  while (layer.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(poseidon2(layer[i]!, layer[i + 1]!));
    }
    layer = next;
  }
  return layer[0]!;
}

export type MerkleProof = {
  /** Sibling hashes at each tree level, bottom (leaf level) first. */
  siblings: bigint[];
  /**
   * Direction bits, parallel to siblings.
   * dirs[i] = 0: the proven node is the LEFT child at level i  (parent = poseidon2(node, sibling))
   * dirs[i] = 1: the proven node is the RIGHT child at level i (parent = poseidon2(sibling, node))
   */
  dirs: number[];
};

/** Compute the Merkle proof for `leaves[index]` against `merkleRoot(leaves)`.
 *  Returns empty siblings/dirs for a single-leaf tree (root = leaf). */
export function merkleProof(leaves: readonly bigint[], index: number): MerkleProof {
  if (index < 0 || index >= leaves.length) {
    throw new RangeError(`merkleProof: index ${index} out of range [0, ${leaves.length})`);
  }
  const n = nextPowerOfTwo(leaves.length);
  let layer: bigint[] = Array.from({ length: n }, (_, i) =>
    i < leaves.length ? leaves[i]! : 0n
  );
  const siblings: bigint[] = [];
  const dirs: number[] = [];
  let idx = index;
  while (layer.length > 1) {
    const isRight = idx % 2 === 1;
    const sibIdx = isRight ? idx - 1 : idx + 1;
    siblings.push(layer[sibIdx]!);
    dirs.push(isRight ? 1 : 0);
    // build next level
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(poseidon2(layer[i]!, layer[i + 1]!));
    }
    layer = next;
    idx = Math.floor(idx / 2);
  }
  return { siblings, dirs };
}

/** Verify a Merkle proof. Returns true iff the leaf is at the committed position in root. */
export function verifyMerkleProof(
  leaf: bigint,
  proof: MerkleProof,
  root: bigint
): boolean {
  const { siblings, dirs } = proof;
  let current = leaf;
  for (let i = 0; i < siblings.length; i++) {
    const sib = siblings[i]!;
    current = dirs[i] === 0
      ? poseidon2(current, sib) // node is left child
      : poseidon2(sib, current); // node is right child
  }
  return current === root;
}

/** Canonical bottom-up direction bits for a leaf at `index` in a tree of `depth`
 *  levels: dirs[i] = bit i of index (LSB first). Mirrors merkleProof's walk. */
export function dirsFromIndex(index: number, depth: number): number[] {
  const dirs: number[] = [];
  let idx = index;
  for (let i = 0; i < depth; i++) {
    dirs.push(idx & 1);
    idx >>= 1;
  }
  return dirs;
}

/**
 * Verify that `leaf` is committed at POSITION `index` under `root`.
 *
 * SOUNDNESS: directions are derived from `index`, NOT taken from the (untrusted)
 * proof. With prover-supplied direction bits a cheater could relocate any valid
 * leaf to a different slot — membership without position binding. Twin of
 * `verify_leaf_at_index` in packages/stylus/src/merkle.rs (the on-chain verifier);
 * use this in any TS code that checks proofs it did not itself generate.
 */
export function verifyLeafAtIndex(
  leaf: bigint,
  siblings: readonly bigint[],
  index: number,
  root: bigint
): boolean {
  const dirs = dirsFromIndex(index, siblings.length);
  return verifyMerkleProof(leaf, { siblings: [...siblings], dirs }, root);
}

// ---------------------------------------------------------------------------
// Canonical leaf index maps (shared constants for TS prover + Rust verifier)
// ---------------------------------------------------------------------------

/**
 * Leaf index for activation[layer][i] in the trace commitment root R.
 *
 * Offset is the running sum of LAYER_SIZES:
 *   layer 0 (input, 3 neurons):  indices  0 ..  2
 *   layer 1 (hidden, 8 neurons): indices  3 .. 10
 *   layer 2 (hidden, 4 neurons): indices 11 .. 14
 *   layer 3 (output, 2 neurons): indices 15 .. 16
 * Total 17 leaves → padded to 32 in the tree.
 */
export function traceLeafIndex(layer: number, i: number): number {
  let offset = 0;
  for (let l = 0; l < layer; l++) offset += LAYER_SIZES[l]!;
  return offset + i;
}

/**
 * Leaf index for node j on weight layer L in the weight commitment root H_w.
 * L ∈ {1, 2, 3} (the weight layer whose OUTPUT is layer L).
 *
 *   L=1 (8 output nodes → input layer K=3):  indices  0 ..  7
 *   L=2 (4 output nodes → layer 1 K=8):      indices  8 .. 11
 *   L=3 (2 output nodes → layer 2 K=4):      indices 12 .. 13
 * Total 14 leaves → padded to 16 in the tree.
 */
export function weightLeafIndex(L: number, j: number): number {
  let offset = 0;
  for (let l = 1; l < L; l++) offset += LAYER_SIZES[l]!;
  return offset + j;
}
