//! Fixed-point Q-format — MUST stay identical to `packages/shared/src/fixed-point.ts`
//! and the Solidity side (CLAUDE.md critical invariant). Q47.16 stored in i64,
//! dot products accumulated in i128, single arithmetic right-shift to renormalize.

use stylus_sdk::alloy_primitives::U256;

/// Fractional bits. SCALE = 2^FRAC_BITS = 65536.
pub const FRAC_BITS: u32 = 16;
pub const SCALE: i64 = 1 << FRAC_BITS;

/// BN254 scalar field modulus r (circom-compatible Poseidon field).
/// = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
/// CRITICAL INVARIANT: identical to FIELD_MODULUS in packages/shared/src/poseidon.ts.
const FIELD_MODULUS: U256 = U256::from_limbs([
    0x43e1f593f0000001u64,
    0x2833e84879b97091u64,
    0xb85045b68181585du64,
    0x30644e72e131a029u64,
]);

/// Signed Q47.16 i64 → BN254 scalar field element.
///   x >= 0  →  x
///   x <  0  →  FIELD_MODULUS + x   (two's-complement folded into the field)
///
/// CRITICAL INVARIANT: must be byte-identical to `feltFromFixed` in
/// packages/shared/src/poseidon.ts. The verifier recomputes a node activation,
/// applies this encoding, and compares to the opened Merkle leaf — divergence
/// silently fails every equality check.
pub fn felt_from_fixed(x: i64) -> U256 {
    if x >= 0 {
        U256::from(x as u64)
    } else {
        FIELD_MODULUS - U256::from((-x) as u64)
    }
}

/// Inverse of felt_from_fixed: BN254 field element → Q47.16 i64.
/// Positive Q47.16 values are small (upper three U256 limbs are zero).
/// Negative values are encoded as FIELD_MODULUS + x ≈ FIELD_MODULUS.
pub fn felt_to_fixed(felt: U256) -> i64 {
    let limbs = felt.as_limbs(); // [u64; 4], little-endian
    if limbs[1] == 0 && limbs[2] == 0 && limbs[3] == 0 {
        limbs[0] as i64
    } else {
        let abs_val = FIELD_MODULUS - felt; // |x| as U256, safe since felt < FIELD_MODULUS
        -(abs_val.as_limbs()[0] as i64)
    }
}

/// Canonical per-node recompute:
///   pre = (Σ_i w_i * a_i) + (bias << FRAC_BITS)   // accumulated as Q(2*FRAC) in i128
///   z   = pre >> FRAC_BITS                          // arithmetic shift, back to Q47.16
/// Activation `phi` is applied by the caller. Inputs are Q47.16 i64 values.
pub fn dot_bias_shift(weights: &[i64], acts: &[i64], bias: i64) -> i64 {
    debug_assert_eq!(weights.len(), acts.len());
    let mut acc: i128 = (bias as i128) << FRAC_BITS;
    for (w, a) in weights.iter().zip(acts.iter()) {
        acc += (*w as i128) * (*a as i128);
    }
    (acc >> FRAC_BITS) as i64
}

/// ReLU on a Q47.16 value (hidden layers).
#[inline]
pub fn relu(x: i64) -> i64 {
    if x > 0 { x } else { 0 }
}

/// Identity activation (output layer).
#[inline]
pub fn identity(x: i64) -> i64 {
    x
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors the golden assertion in shared/src/fixed-point.test.ts.
    #[test]
    fn dot_bias_shift_matches_reference() {
        // 0.5*2 + (-1)*1 + 0.25 = 0.25  => 0.25 * SCALE
        let half = SCALE / 2;
        let w = [half, -SCALE];
        let a = [2 * SCALE, SCALE];
        let out = dot_bias_shift(&w, &a, SCALE / 4);
        assert_eq!(out, SCALE / 4);
    }

    #[test]
    fn relu_clamps_negatives() {
        assert_eq!(relu(-3 * SCALE), 0);
        assert_eq!(relu(3 * SCALE), 3 * SCALE);
        assert_eq!(identity(-3 * SCALE), -3 * SCALE);
    }

    #[test]
    fn felt_from_fixed_nonneg() {
        assert_eq!(felt_from_fixed(0), U256::ZERO);
        assert_eq!(felt_from_fixed(1), U256::from(1u64));
        assert_eq!(felt_from_fixed(SCALE), U256::from(SCALE as u64)); // 1.0
    }

    #[test]
    fn felt_from_fixed_neg() {
        // -1 should map to FIELD_MODULUS - 1
        let m1 = felt_from_fixed(-1);
        assert_eq!(m1, FIELD_MODULUS - U256::from(1u64));
        // round-trip
        assert_eq!(felt_to_fixed(m1), -1);
    }

    #[test]
    fn felt_to_fixed_roundtrip() {
        for &x in &[0i64, 1, -1, 65536, -65536, 32768, -32768, 1000, -1000] {
            let felt = felt_from_fixed(x);
            assert_eq!(felt_to_fixed(felt), x);
        }
    }
}
