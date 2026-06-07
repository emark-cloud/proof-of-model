//! Proof-of-Model Verifier (Stylus / Rust) — the deep-engineering core.
//!
//! Verifies a RandPathTest opening: Poseidon-Merkle proofs against the trace root R
//! and weight root H_w, then recomputes each node's fixed-point activation along the
//! sampled output→input path (`a_j = φ(Σ w_ij·a_i + b_j)` in Q47.16) and asserts
//! equality at every node → PASS/FAIL. See CLAUDE.md "How verification works".
//!
//! Wire format decoded here is the §1.4 layout emitted by `packages/model/src/path.ts`
//! `encodePathProof`. The golden JSON fixtures from `packages/model/fixtures.json` are
//! the acceptance oracle: known-good must return true, known-bad must return false.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

pub mod fixed;
pub mod merkle;

use alloc::vec::Vec;
use stylus_sdk::{alloy_primitives::U256, prelude::*};

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonHasher};

// ---------------------------------------------------------------------------
// Network constants — must match packages/shared/src/network.ts
// ---------------------------------------------------------------------------

/// 3 → 8 → 4 → 2 fixed-point net.
const LAYER_SIZES: [usize; 4] = [3, 8, 4, 2];
/// One sampled node per non-input layer.
const PATH_LENGTH: usize = 3;

/// Leaf index for activation[layer][i] in the trace commitment (17 leaves, pad 32).
fn trace_leaf_index(layer: usize, i: usize) -> usize {
    let mut off = 0;
    for l in 0..layer {
        off += LAYER_SIZES[l];
    }
    off + i
}

/// Leaf index for node j on weight layer L in the weight commitment (14 leaves, pad 16).
/// L is 1-indexed (1..=3).
fn weight_leaf_index(l: usize, j: usize) -> usize {
    let mut off = 0;
    for ll in 1..l {
        off += LAYER_SIZES[ll];
    }
    off + j
}

// ---------------------------------------------------------------------------
// Storage + public entrypoints
// ---------------------------------------------------------------------------

sol_storage! {
    #[entrypoint]
    pub struct Verifier {
        // Number of paths verified (liveness counter; written by ChallengeManager in
        // Phase 2 — Verifier stays pure/view per IVerifier ABI).
        uint256 verified_count;
    }
}

#[public]
impl Verifier {
    /// Poseidon hash of two field elements (circom-compatible, t=3). Proven equal to
    /// the TS/Solidity oracles in Phase 0 (3/3 POSEIDON_GOLDEN vectors).
    pub fn hash2(&self, a: U256, b: U256) -> U256 {
        poseidon2(a, b)
    }

    /// Verify a RandPathTest opening.
    ///
    /// Returns true iff every node on the output→input path:
    ///   (a) opens correctly from trace_root and weight_root via Merkle proofs, and
    ///   (b) its activation recomputes correctly from its weight row + parent activations.
    pub fn verify_path(
        &self,
        trace_root: U256,
        weight_root: U256,
        path_proof: Vec<u8>,
    ) -> bool {
        verify_proof_inner(trace_root, weight_root, &path_proof)
    }

    pub fn verified_count(&self) -> U256 {
        self.verified_count.get()
    }
}

// ---------------------------------------------------------------------------
// Poseidon (free function — used by merkle.rs via crate::poseidon2)
// ---------------------------------------------------------------------------

/// Circom-compatible 2-input Poseidon (BN254 scalar field, t=3).
/// CRITICAL INVARIANT: byte-identical to TS poseidon-lite and Solidity implementations
/// (verified 3/3 on POSEIDON_GOLDEN in Phase 0 — see poseidon.test.ts).
pub(crate) fn poseidon2(a: U256, b: U256) -> U256 {
    let fa = Fr::from_be_bytes_mod_order(&a.to_be_bytes::<32>());
    let fb = Fr::from_be_bytes_mod_order(&b.to_be_bytes::<32>());
    let mut hasher = Poseidon::<Fr>::new_circom(2).unwrap();
    let digest = hasher.hash(&[fa, fb]).unwrap();
    let be = digest.into_bigint().to_bytes_be();
    let mut buf = [0u8; 32];
    let start = 32 - be.len();
    buf[start..].copy_from_slice(&be);
    U256::from_be_bytes(buf)
}

// ---------------------------------------------------------------------------
// Path proof decoder (§1.4 wire format from packages/model/src/path.ts)
// ---------------------------------------------------------------------------

struct Decoder<'a> {
    buf: &'a [u8],
    off: usize,
}

impl<'a> Decoder<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, off: 0 }
    }

    fn read_u8(&mut self) -> Option<u8> {
        if self.off < self.buf.len() {
            let b = self.buf[self.off];
            self.off += 1;
            Some(b)
        } else {
            None
        }
    }

    fn read_felt(&mut self) -> Option<U256> {
        if self.off + 32 <= self.buf.len() {
            let arr: [u8; 32] = self.buf[self.off..self.off + 32].try_into().ok()?;
            self.off += 32;
            Some(U256::from_be_bytes(arr))
        } else {
            None
        }
    }

    /// Read [ len: u8 ][ siblings: len×32B ][ dirs: len×u8 ]
    fn read_proof(&mut self) -> Option<(Vec<U256>, Vec<u8>)> {
        let len = self.read_u8()? as usize;
        let mut siblings = Vec::with_capacity(len);
        for _ in 0..len {
            siblings.push(self.read_felt()?);
        }
        let mut dirs = Vec::with_capacity(len);
        for _ in 0..len {
            dirs.push(self.read_u8()?);
        }
        Some((siblings, dirs))
    }
}

// ---------------------------------------------------------------------------
// Core verification logic
// ---------------------------------------------------------------------------

fn verify_proof_inner(trace_root: U256, weight_root: U256, proof_bytes: &[u8]) -> bool {
    let mut dec = Decoder::new(proof_bytes);

    let path_len = match dec.read_u8() {
        Some(n) => n as usize,
        None => return false,
    };
    if path_len != PATH_LENGTH {
        return false;
    }

    for t in 0..path_len {
        // Path is output→input: t=0 → L=3, t=1 → L=2, t=2 → L=1
        let layer = PATH_LENGTH - t;
        let parent_layer = layer - 1;
        let k = LAYER_SIZES[parent_layer];

        // --- decode node fields ---
        let node_index = match dec.read_u8() {
            Some(v) => v as usize,
            None => return false,
        };
        // Bind the claimed node to a real slot in its layer — out-of-range indices
        // must not alias another layer's leaves or padding.
        if node_index >= LAYER_SIZES[layer] {
            return false;
        }
        let node_act = match dec.read_felt() {
            Some(v) => v,
            None => return false,
        };
        let bias_felt = match dec.read_felt() {
            Some(v) => v,
            None => return false,
        };
        let mut weight_row: Vec<U256> = Vec::with_capacity(k);
        for _ in 0..k {
            match dec.read_felt() {
                Some(v) => weight_row.push(v),
                None => return false,
            }
        }
        let mut parent_acts: Vec<U256> = Vec::with_capacity(k);
        for _ in 0..k {
            match dec.read_felt() {
                Some(v) => parent_acts.push(v),
                None => return false,
            }
        }
        // Direction bits (`_*_dirs`) are intentionally ignored — positions are derived
        // from the canonical leaf index below, not trusted from the prover.
        let (w_sibs, _w_dirs) = match dec.read_proof() {
            Some(v) => v,
            None => return false,
        };
        let (na_sibs, _na_dirs) = match dec.read_proof() {
            Some(v) => v,
            None => return false,
        };
        let mut pa_proofs: Vec<(Vec<U256>, Vec<u8>)> = Vec::with_capacity(k);
        for _ in 0..k {
            match dec.read_proof() {
                Some(v) => pa_proofs.push(v),
                None => return false,
            }
        }

        // --- 1. Verify nodeActivation leaf ∈ trace_root at its committed position ---
        let na_index = trace_leaf_index(layer, node_index);
        if !merkle::verify_leaf_at_index(node_act, &na_sibs, na_index, trace_root) {
            return false;
        }

        // --- 2. Verify each parentAct[i] leaf ∈ trace_root at parent-layer slot i ---
        for (i, (pa, (pa_sibs, _pa_dirs))) in parent_acts.iter().zip(pa_proofs.iter()).enumerate() {
            let pa_index = trace_leaf_index(parent_layer, i);
            if !merkle::verify_leaf_at_index(*pa, pa_sibs, pa_index, trace_root) {
                return false;
            }
        }

        // --- 3. Verify rowLeaf(L, j) = poseidon_many([weights.., bias]) ∈ weight_root ---
        let w_index = weight_leaf_index(layer, node_index);
        let mut row_felts: Vec<U256> = weight_row.clone();
        row_felts.push(bias_felt);
        let row_leaf = merkle::poseidon_many(&row_felts);
        if !merkle::verify_leaf_at_index(row_leaf, &w_sibs, w_index, weight_root) {
            return false;
        }

        // --- 4. Recompute activation and assert equality ---
        let weights_i64: Vec<i64> = weight_row.iter().map(|&f| fixed::felt_to_fixed(f)).collect();
        let parent_i64: Vec<i64> = parent_acts.iter().map(|&f| fixed::felt_to_fixed(f)).collect();
        let bias_i64 = fixed::felt_to_fixed(bias_felt);

        let z = fixed::dot_bias_shift(&weights_i64, &parent_i64, bias_i64);
        // ACTIVATIONS (from shared/network.ts): layer 1 → relu, layer 2 → relu, layer 3 → identity
        let a = if layer == 3 {
            fixed::identity(z)
        } else {
            fixed::relu(z)
        };
        if fixed::felt_from_fixed(a) != node_act {
            return false;
        }
    }

    true
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    // Golden fixtures emitted by `packages/model` — the shared oracle for TS + Rust.
    static FIXTURES_JSON: &str = include_str!("../../model/fixtures.json");

    /// Parse an optionally-odd-length "0x..." hex string into a left-padded U256.
    fn parse_u256_hex(s: &str) -> U256 {
        let hex = s.trim_start_matches("0x");
        // Left-pad to even length so byte parsing works
        let padded;
        let hex = if hex.len() % 2 == 1 {
            padded = alloc::format!("0{}", hex);
            padded.as_str()
        } else {
            hex
        };
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        assert!(bytes.len() <= 32, "hex too long for U256");
        let mut arr = [0u8; 32];
        arr[32 - bytes.len()..].copy_from_slice(&bytes);
        U256::from_be_bytes(arr)
    }

    fn parse_proof_bytes(s: &str) -> Vec<u8> {
        let hex = s.trim_start_matches("0x");
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect()
    }

    // Re-assert Poseidon golden vectors 3/3 (regression guard, Phase 0).
    // Identical to POSEIDON_GOLDEN in packages/shared/src/poseidon.ts.
    #[test]
    fn poseidon_golden_3_of_3() {
        let cases: &[(U256, U256, &str)] = &[
            (
                U256::from(1u64),
                U256::from(2u64),
                "0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a",
            ),
            (
                U256::ZERO,
                U256::ZERO,
                "0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864",
            ),
            (
                // first hash reused as first input (chaining test)
                parse_u256_hex(
                    "0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a",
                ),
                U256::from(42u64),
                "0x0d19f766383a61c3e253f742367666002931a039d818c9c491eb3f918342f3b5",
            ),
        ];
        for (a, b, expected_hex) in cases {
            let got = poseidon2(*a, *b);
            let expected = parse_u256_hex(expected_hex);
            assert_eq!(got, expected, "poseidon golden failed for inputs ({a}, {b})");
        }
    }

    #[test]
    fn known_good_passes() {
        let v: Value = serde_json::from_str(FIXTURES_JSON).unwrap();
        let g = &v["knownGood"];
        let trace_root = parse_u256_hex(g["traceRoot"].as_str().unwrap());
        let weight_root = parse_u256_hex(g["weightRoot"].as_str().unwrap());
        let proof_bytes = parse_proof_bytes(g["pathProofHex"].as_str().unwrap());
        assert!(
            verify_proof_inner(trace_root, weight_root, &proof_bytes),
            "known-good fixture must PASS"
        );
    }

    #[test]
    fn known_bad_fails() {
        let v: Value = serde_json::from_str(FIXTURES_JSON).unwrap();
        let b = &v["knownBad"];
        let trace_root = parse_u256_hex(b["traceRoot"].as_str().unwrap());
        let weight_root = parse_u256_hex(b["weightRoot"].as_str().unwrap());
        let proof_bytes = parse_proof_bytes(b["pathProofHex"].as_str().unwrap());
        assert!(
            !verify_proof_inner(trace_root, weight_root, &proof_bytes),
            "known-bad fixture must FAIL"
        );
    }

    // Regression for the Merkle position-binding fix: positions are derived from the
    // canonical leaf index, not trusted from the prover. Byte 0 is path_len; byte 1 is
    // the first node's node_index (output layer, valid range 0..=1).

    #[test]
    fn out_of_range_node_index_fails() {
        let v: Value = serde_json::from_str(FIXTURES_JSON).unwrap();
        let g = &v["knownGood"];
        let trace_root = parse_u256_hex(g["traceRoot"].as_str().unwrap());
        let weight_root = parse_u256_hex(g["weightRoot"].as_str().unwrap());
        let mut proof_bytes = parse_proof_bytes(g["pathProofHex"].as_str().unwrap());
        proof_bytes[1] = 200; // node_index ≫ LAYER_SIZES[3] = 2
        assert!(
            !verify_proof_inner(trace_root, weight_root, &proof_bytes),
            "out-of-range node_index must FAIL (no aliasing other leaves)"
        );
    }

    #[test]
    fn relocated_node_index_fails() {
        let v: Value = serde_json::from_str(FIXTURES_JSON).unwrap();
        let g = &v["knownGood"];
        let trace_root = parse_u256_hex(g["traceRoot"].as_str().unwrap());
        let weight_root = parse_u256_hex(g["weightRoot"].as_str().unwrap());
        let mut proof_bytes = parse_proof_bytes(g["pathProofHex"].as_str().unwrap());
        // Flip to the OTHER valid output node (0↔1): in-range, but the opened leaf no
        // longer matches that committed position — only the position-binding check
        // (not the recompute) rejects this.
        proof_bytes[1] ^= 1;
        assert!(
            !verify_proof_inner(trace_root, weight_root, &proof_bytes),
            "relocating a valid leaf to a different slot must FAIL"
        );
    }
}
