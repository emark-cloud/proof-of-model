import { dotBiasShift, relu, identity, LAYER_SIZES, ACTIVATIONS, type Fixed } from "@proof/shared";
import { WEIGHTS, BIASES } from "./weights.js";

export interface InferenceResult {
  /** Per-layer activations: trace[0]=input … trace[3]=output (Q47.16). */
  trace: Fixed[][];
  /** Output-layer activations (Q47.16). Alias for trace[3]. */
  output: Fixed[];
}

/**
 * Deterministic fixed-point forward pass: 3→8→4→2 with Q47.16 arithmetic.
 * Uses WEIGHTS and BIASES generated from WEIGHT_SEED; pure function.
 * Returns the full activation trace so the prover can commit it as trace root R.
 */
export function forward(input: Fixed[]): InferenceResult {
  if (input.length !== LAYER_SIZES[0]) {
    throw new RangeError(`forward: expected ${LAYER_SIZES[0]} inputs, got ${input.length}`);
  }
  const trace: Fixed[][] = [input.slice()];
  let acts: Fixed[] = input.slice();

  for (let L = 1; L < LAYER_SIZES.length; L++) {
    const numNodes = LAYER_SIZES[L]!;
    const phi = ACTIVATIONS[L - 1] === "relu" ? relu : identity;
    const layerActs: Fixed[] = [];
    for (let j = 0; j < numNodes; j++) {
      const z = dotBiasShift(WEIGHTS[L - 1]![j]!, acts, BIASES[L - 1]![j]!);
      layerActs.push(phi(z));
    }
    trace.push(layerActs);
    acts = layerActs;
  }

  return { trace, output: acts };
}
