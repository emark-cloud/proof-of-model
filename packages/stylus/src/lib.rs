//! Proof-of-Model Verifier (Stylus / Rust) — the deep-engineering core.
//!
//! Verifies a RandPathTest opening: Poseidon-Merkle proofs against the trace root R
//! and weight root H_w, then recomputes each node's fixed-point activation along the
//! sampled output→input path (`a_j = φ(Σ w_ij·a_i + b_j)` in Q47.16) and asserts
//! equality at every node → PASS/FAIL. See CLAUDE.md "How verification works".
//!
//! Phase 0.5 SCAFFOLD: this wires the proven Phase-0 Poseidon path + fixed-point
//! module and exposes the entrypoint shape. The full path-recompute logic and the
//! `pathProof` calldata decoding land in Phase 1 (against `packages/model` fixtures).

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

pub mod fixed;

use stylus_sdk::{alloy_primitives::U256, prelude::*};

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonHasher};

sol_storage! {
    #[entrypoint]
    pub struct Verifier {
        // Number of paths verified so far (cheap liveness counter for the demo).
        uint256 verified_count;
    }
}

#[public]
impl Verifier {
    /// Poseidon hash of two field elements (circom-compatible, t=3) — the Merkle
    /// compression function. Proven equal to the TS/Solidity oracles in Phase 0.
    pub fn hash2(&self, a: U256, b: U256) -> U256 {
        Self::poseidon2(a, b)
    }

    /// Verify a RandPathTest opening. Phase 1 fills in Merkle verification +
    /// per-node fixed-point recompute along the sampled path.
    ///
    /// SCAFFOLD: returns false (no opening decoded yet) so callers compile and the
    /// honest/cheat fixtures can be wired against a real signature in Phase 1.
    pub fn verify_path(
        &self,
        _trace_root: U256,
        _weight_root: U256,
        _path_proof: alloc::vec::Vec<u8>,
    ) -> bool {
        false
    }

    pub fn verified_count(&self) -> U256 {
        self.verified_count.get()
    }
}

impl Verifier {
    fn poseidon2(a: U256, b: U256) -> U256 {
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
}
