//! Fixed-point Q-format — MUST stay identical to `packages/shared/src/fixed-point.ts`
//! and the Solidity side (CLAUDE.md critical invariant). Q47.16 stored in i64,
//! dot products accumulated in i128, single arithmetic right-shift to renormalize.

/// Fractional bits. SCALE = 2^FRAC_BITS = 65536.
pub const FRAC_BITS: u32 = 16;
pub const SCALE: i64 = 1 << FRAC_BITS;

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
}
