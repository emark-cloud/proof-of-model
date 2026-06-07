/**
 * Fixed-point Q-format — SINGLE SOURCE OF TRUTH.
 *
 * CRITICAL INVARIANT (CLAUDE.md): these constants and the recompute semantics
 * below MUST be byte-for-byte identical across TypeScript (this file), Rust/Stylus
 * (packages/stylus), and Solidity (packages/contracts). Any divergence silently
 * breaks every per-node equality check in the verifier.
 *
 * Format: signed Q47.16 stored in a 64-bit two's-complement integer (i64).
 *   - WORD_BITS = 64, FRAC_BITS = 16  →  SCALE = 2^16 = 65536
 *   - a real number x is encoded as  round(x * SCALE)  as an i64
 *   - in TS we carry every fixed-point value as a `bigint` (to dodge the 2^53
 *     float limit); Rust uses i64, Solidity uses int64 (cast from int256 math).
 *
 * Why 16 fractional bits: the toy net (3→8→4→2) has at most 8 incoming edges
 * per neuron. A dot product accumulates ≤8 products of two Q16.16 i64 values.
 * Each product is Q32.32 and fits in i128; the sum of 8 fits comfortably. We
 * renormalize with a single right-shift at the end. 16 frac bits gives ~1.5e-5
 * resolution — ample for a deterministic demo net while leaving huge integer
 * headroom (±1.4e14 real) so nothing overflows i64 at the storage layer.
 */

export const WORD_BITS = 64n;
export const FRAC_BITS = 16n;
export const SCALE = 1n << FRAC_BITS; // 65536

/** Inclusive i64 storage bounds. Encoded values must stay within these. */
export const I64_MIN = -(1n << 63n);
export const I64_MAX = (1n << 63n) - 1n;

export type Fixed = bigint; // an i64-range integer in Q47.16

/** Encode a JS number into Q47.16 (round half away from zero). Encode-time only. */
export function toFixed(x: number): Fixed {
  const scaled = x * Number(SCALE);
  const r = BigInt(Math.round(scaled));
  if (r < I64_MIN || r > I64_MAX) {
    throw new RangeError(`toFixed(${x}) -> ${r} overflows i64`);
  }
  return r;
}

/** Decode a Q47.16 fixed-point value back to a JS number (lossy). */
export function fromFixed(x: Fixed): number {
  return Number(x) / Number(SCALE);
}

/**
 * The canonical per-node recompute used by the verifier:
 *   pre = (Σ_i w_i * a_i)  +  (bias << FRAC_BITS)        // accumulated as Q(2*FRAC) in i128
 *   z   = pre >> FRAC_BITS                                 // renormalize to Q47.16
 *   a_j = phi(z)                                           // activation
 *
 * Inputs `weights`, `acts`, and `bias` are all Q47.16 i64 values. The
 * accumulator is wider than i64 (BigInt here; i128 in Rust/Solidity). The
 * right-shift is an ARITHMETIC shift (floor toward -inf), which Rust `>>` on
 * signed and Solidity `>>` on a signed accumulator both perform — keep it that
 * way on every implementation.
 */
export function dotBiasShift(weights: Fixed[], acts: Fixed[], bias: Fixed): Fixed {
  if (weights.length !== acts.length) {
    throw new Error(`dot length mismatch: ${weights.length} vs ${acts.length}`);
  }
  let acc = bias << FRAC_BITS; // Q(2*FRAC)
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]! * acts[i]!;
  }
  return arithShiftRight(acc, FRAC_BITS); // back to Q47.16
}

/** Arithmetic (floor) right shift for BigInt — matches signed `>>` in Rust/Solidity. */
export function arithShiftRight(x: bigint, bits: bigint): bigint {
  // BigInt `>>` is already arithmetic (floors toward -inf) for negatives.
  return x >> bits;
}

/** ReLU on a Q47.16 value: max(0, x). Hidden-layer activation. */
export function relu(x: Fixed): Fixed {
  return x > 0n ? x : 0n;
}

/** Identity activation: output layer leaves the pre-activation untouched. */
export function identity(x: Fixed): Fixed {
  return x;
}
