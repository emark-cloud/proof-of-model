/**
 * @proof/model — deterministic fixed-point reference net (3→8→4→2).
 *
 * Phase 0.5 SCAFFOLD. Phase 1 implements:
 *   - forward(input): deterministic Q47.16 inference producing the full activation trace
 *   - commit(trace): Poseidon-Merkle root R; weightRoot(): H_w
 *   - openPath(ρ): the verifier's proof bundle for a random output→input path
 *     (per node: activation, weight row + bias, full parent-layer acts, Merkle paths)
 *   - golden known-good + known-bad fixtures (the contract for the Stylus verifier)
 *
 * It reuses the shared Q-format + Poseidon params so TS/Rust/Solidity stay in lockstep.
 */
import { LAYER_SIZES, ACTIVATIONS, type Fixed } from "@proof/shared";

export interface InferenceResult {
  /** Per-layer activations, layer 0 = input … layer L = output (Q47.16). */
  trace: Fixed[][];
  /** The output-layer activations (Q47.16). */
  output: Fixed[];
}

/** Placeholder — Phase 1 implements deterministic forward inference. */
export function forward(_input: Fixed[]): InferenceResult {
  throw new Error("not implemented (Phase 1)");
}

export const SHAPE = { LAYER_SIZES, ACTIVATIONS } as const;
