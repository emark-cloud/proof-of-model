//! Merkle tree verification — twin of packages/shared/src/merkle.ts.
//!
//! CRITICAL INVARIANT: tree shape, leaf ordering, and padding rules MUST be
//! identical to the TS source. Any divergence silently breaks every on-chain proof.
//! Do not change without updating packages/shared/src/merkle.ts as well.
//!
//! Rules (matching TS):
//!   - Binary Merkle tree over poseidon2(left, right).
//!   - Leaves padded to the next power of two with field element 0.
//!   - Parent = poseidon2(child0, child1), lower-index child is left.
//!   - Single-leaf tree: root = leaf (no hashing).
//!   - Proof is bottom-up (leaf level first).
//!     dirs[i] = 0: node is LEFT child  → parent = poseidon2(node, sibling)
//!     dirs[i] = 1: node is RIGHT child → parent = poseidon2(sibling, node)

use stylus_sdk::alloy_primitives::U256;

/// Fixed left-fold Poseidon hash over a non-empty slice of field elements.
///   acc = felts[0]; for k in 1..: acc = poseidon2(acc, felts[k])
/// This is the row-commit function: rowLeaf = poseidon_many([w0,..,wK-1, bias]).
pub fn poseidon_many(felts: &[U256]) -> U256 {
    debug_assert!(!felts.is_empty(), "poseidon_many: empty input");
    let mut acc = felts[0];
    for &f in &felts[1..] {
        acc = crate::poseidon2(acc, f);
    }
    acc
}

/// Verify a Merkle proof. Returns true iff `leaf` is the committed value at the
/// position encoded by `dirs` under `root`.
pub fn verify_merkle_proof(leaf: U256, siblings: &[U256], dirs: &[u8], root: U256) -> bool {
    let mut current = leaf;
    for (sib, &dir) in siblings.iter().zip(dirs.iter()) {
        current = if dir == 0 {
            crate::poseidon2(current, *sib) // node is left child
        } else {
            crate::poseidon2(*sib, current) // node is right child
        };
    }
    current == root
}
