/**
 * Network topology — SINGLE SOURCE OF TRUTH.
 *
 * Deterministic fixed-point net: 3 → 8 → 4 → 2 (CLAUDE.md "locked decisions").
 * NOT a real LLM — by design. Weights are Q47.16 (see fixed-point.ts), committed
 * by the weight root H_w; activations across all layers form the trace committed
 * by root R.
 *
 *   layer 0 (input):  3 neurons   — the immutable input layer (anchor of the path)
 *   layer 1 (hidden): 8 neurons   — ReLU            (8 = max width N, sets the ~1/N bound)
 *   layer 2 (hidden): 4 neurons   — ReLU
 *   layer 3 (output): 2 neurons   — identity        (path starts from a random output neuron)
 *
 * A RandPathTest sample is one node per non-input layer: output → h2 → h1 → input,
 * i.e. 3 local per-node checks for this net (see spec.md / CLAUDE.md).
 */

export const LAYER_SIZES = [3, 8, 4, 2] as const;
export type LayerSizes = typeof LAYER_SIZES;

/** Max layer width N — the single-path detection bound is ~1/N (paper §5). */
export const MAX_WIDTH = Math.max(...LAYER_SIZES); // 8

/** Number of weight layers (edges between adjacent layers). */
export const NUM_WEIGHT_LAYERS = LAYER_SIZES.length - 1; // 3

export type Activation = "relu" | "identity";

/** Activation per weight-layer output (index 0 = layer1, …). Output layer = identity. */
export const ACTIVATIONS: readonly Activation[] = ["relu", "relu", "identity"];

/** Path length: one sampled node per non-input layer. */
export const PATH_LENGTH = NUM_WEIGHT_LAYERS; // 3
