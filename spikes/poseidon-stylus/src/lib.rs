//! Phase-0 spike: Poseidon hash on-chain under Stylus/WASM.
//!
//! Goal: prove the production-path Poseidon (circom-compatible, BN254, via `light-poseidon`
//! over arkworks) compiles to valid Stylus WASM, deploys to Arbitrum Sepolia, and returns
//! the SAME field element as the off-chain reference — the core invariant of the project
//! ("Poseidon params identical across TS/Rust/Solidity").
//!
//! Not audited; spike only.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use stylus_sdk::{alloy_primitives::U256, prelude::*};

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonHasher};

sol_storage! {
    #[entrypoint]
    pub struct PoseidonSpike {
        // last computed digest, so we exercise a state-writing path too (gas profile)
        uint256 last;
    }
}

#[public]
impl PoseidonSpike {
    /// Pure view: Poseidon hash of two field elements, circom-compatible (t=3).
    /// Inputs are reduced mod the BN254 scalar field. Returns the digest as U256.
    pub fn hash2(&self, a: U256, b: U256) -> U256 {
        Self::poseidon2(a, b)
    }

    /// State-writing variant: compute + store, returns the digest. Exercises a write path.
    pub fn commit2(&mut self, a: U256, b: U256) -> U256 {
        let h = Self::poseidon2(a, b);
        self.last.set(h);
        h
    }

    pub fn last(&self) -> U256 {
        self.last.get()
    }
}

impl PoseidonSpike {
    fn poseidon2(a: U256, b: U256) -> U256 {
        // U256 (big-endian) -> Fr, reducing mod field order.
        let fa = Fr::from_be_bytes_mod_order(&a.to_be_bytes::<32>());
        let fb = Fr::from_be_bytes_mod_order(&b.to_be_bytes::<32>());

        let mut hasher = Poseidon::<Fr>::new_circom(2).unwrap();
        let digest = hasher.hash(&[fa, fb]).unwrap();

        // Fr -> big-endian bytes -> U256 (pad to 32 defensively).
        let be = digest.into_bigint().to_bytes_be();
        let mut buf = [0u8; 32];
        let start = 32 - be.len();
        buf[start..].copy_from_slice(&be);
        U256::from_be_bytes(buf)
    }
}
