/**
 * Deterministic weights + weight root H_w — SINGLE SOURCE OF TRUTH for the model definition.
 *
 * CRITICAL INVARIANT: H_w is what the provider registers on-chain. The Stylus
 * verifier receives it as `weightRoot` and verifies each opened weight row against it.
 * Do NOT change WEIGHT_SEED or the generation scheme without invalidating all fixtures
 * and any deployed commitments.
 *
 * Generation scheme (§1.1 of phase1-plan.md):
 *   Global indices: all weights layer-major (L=1 first), then all biases (same order).
 *   Weights in [-1,  1): raw = poseidon2(SEED, idx) mod 2^17; signed = raw - 2^16
 *   Biases  in [-½, ½): raw = poseidon2(SEED, idx) mod 2^16; signed = raw - 2^15
 */

import {
  poseidon2,
  feltFromFixed,
  poseidonMany,
  merkleRoot,
  weightLeafIndex,
  LAYER_SIZES,
  WEIGHT_SEED,
  type Fixed,
} from "@proof/shared";

// Total weights: (8×3)+(4×8)+(2×4) = 24+32+8 = 64
const TOTAL_WEIGHTS = 64;

function weightGlobalIdx(L: number, j: number, i: number): number {
  let offset = 0;
  for (let l = 1; l < L; l++) offset += LAYER_SIZES[l]! * LAYER_SIZES[l - 1]!;
  return offset + j * LAYER_SIZES[L - 1]! + i;
}

function biasGlobalIdx(L: number, j: number): number {
  let offset = TOTAL_WEIGHTS;
  for (let l = 1; l < L; l++) offset += LAYER_SIZES[l]!;
  return offset + j;
}

function genWeight(globalIdx: number): Fixed {
  const raw = poseidon2(WEIGHT_SEED, BigInt(globalIdx)) % (1n << 17n);
  return raw - (1n << 16n);
}

function genBias(globalIdx: number): Fixed {
  const raw = poseidon2(WEIGHT_SEED, BigInt(globalIdx)) % (1n << 16n);
  return raw - (1n << 15n);
}

/** WEIGHTS[l][j][i]: layer L=l+1, node j, incoming index i (Q47.16 i64). */
export const WEIGHTS: Fixed[][][] = Array.from({ length: 3 }, (_, l) => {
  const L = l + 1;
  return Array.from({ length: LAYER_SIZES[L]! }, (_, j) =>
    Array.from({ length: LAYER_SIZES[L - 1]! }, (_, i) =>
      genWeight(weightGlobalIdx(L, j, i))
    )
  );
});

/** BIASES[l][j]: layer L=l+1, node j (Q47.16 i64). */
export const BIASES: Fixed[][] = Array.from({ length: 3 }, (_, l) => {
  const L = l + 1;
  return Array.from({ length: LAYER_SIZES[L]! }, (_, j) =>
    genBias(biasGlobalIdx(L, j))
  );
});

/**
 * Row commitment leaf for node (L, j):
 *   poseidonMany([feltFromFixed(w_0), …, feltFromFixed(w_{K-1}), feltFromFixed(bias_j)])
 * This is what gets committed into H_w at weightLeafIndex(L, j).
 */
export function rowLeaf(L: number, j: number): bigint {
  return poseidonMany([
    ...WEIGHTS[L - 1]![j]!.map(feltFromFixed),
    feltFromFixed(BIASES[L - 1]![j]!),
  ]);
}

/** Weight Merkle commitment root H_w. Providers register this on-chain via Registry. */
export function weightRoot(): bigint {
  const leaves: bigint[] = Array.from({ length: 14 }, () => 0n);
  for (let L = 1; L <= 3; L++) {
    for (let j = 0; j < LAYER_SIZES[L]!; j++) {
      leaves[weightLeafIndex(L, j)] = rowLeaf(L, j);
    }
  }
  return merkleRoot(leaves);
}
