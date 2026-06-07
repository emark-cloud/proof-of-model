import { feltFromFixed, merkleRoot, traceLeafIndex, LAYER_SIZES, type Fixed } from "@proof/shared";

/** Total number of activation leaves (inputs + all hidden + outputs): 3+8+4+2 = 17, padded to 32. */
const TOTAL_TRACE_LEAVES = LAYER_SIZES.reduce((a: number, b: number) => a + b, 0);

/**
 * Build the activation trace commitment root R.
 * Each leaf is feltFromFixed(trace[layer][i]) at traceLeafIndex(layer, i).
 * The Stylus verifier re-opens individual leaves from this root to check the path.
 */
export function commit(trace: Fixed[][]): bigint {
  const leaves: bigint[] = Array.from({ length: TOTAL_TRACE_LEAVES }, () => 0n);
  for (let layer = 0; layer < trace.length; layer++) {
    for (let i = 0; i < trace[layer]!.length; i++) {
      leaves[traceLeafIndex(layer, i)] = feltFromFixed(trace[layer]![i]!);
    }
  }
  return merkleRoot(leaves);
}
