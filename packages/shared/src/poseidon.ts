/**
 * Poseidon parameters — SINGLE SOURCE OF TRUTH.
 *
 * The Merkle commitments (trace root R, weight root H_w) and every Merkle-proof
 * verification on-chain use the SAME Poseidon hash. The three implementations
 * that must agree (verified 3/3 in the Phase-0 spike, see phase0-spike-results.md):
 *   - TS:       poseidon-lite `poseidon2([a, b])`
 *   - Rust:     light-poseidon `Poseidon::new_circom(2)` (arkworks BN254)
 *   - Solidity: circom-compatible Poseidon (poseidon-solidity / circomlib)
 *
 * Configuration: circom-compatible Poseidon over the BN254 (alt_bn128) SCALAR
 * field, width t = 3 (rate 2, capacity 1) — i.e. a 2-input compression hash.
 * All leaf/inner values are field elements in [0, FIELD_MODULUS).
 */

/** BN254 / alt_bn128 scalar field modulus (the field circom Poseidon operates in). */
export const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Poseidon width t (state size). t = 3 ⇒ 2 inputs + 1 capacity ⇒ hash2(a, b). */
export const POSEIDON_T = 3;
export const POSEIDON_RATE = 2;
export const POSEIDON_CAPACITY = 1;

/** Reduce an arbitrary bigint into the BN254 scalar field. */
export function toField(x: bigint): bigint {
  const m = x % FIELD_MODULUS;
  return m < 0n ? m + FIELD_MODULUS : m;
}

/**
 * Golden Poseidon test vectors (circom-compatible, t=3), captured from the
 * Phase-0 reference oracle (`spikes/poseidon-ref.mjs`). Every implementation —
 * TS, Rust, Solidity — MUST reproduce these exactly. Assert them in each
 * package's tests (Critical invariant: golden fixtures are the contract).
 */
export const POSEIDON_GOLDEN: ReadonlyArray<{
  inputs: readonly [bigint, bigint];
  hash: bigint;
}> = [
  {
    inputs: [1n, 2n],
    hash: 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an,
  },
  {
    inputs: [0n, 0n],
    hash: 0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864n,
  },
  {
    inputs: [
      7853200120776062878684798364095072458815029376092732009249414926327459813530n,
      42n,
    ],
    hash: 0x0d19f766383a61c3e253f742367666002931a039d818c9c491eb3f918342f3b5n,
  },
];
