// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IVerifier
/// @notice Interface to the Stylus (Rust) Verifier — the deep-engineering core.
/// @dev The implementation lives in `packages/stylus`. Given a sampled
///      output→input path opening, it verifies the Poseidon Merkle proofs
///      against the trace root R and weight root H_w, recomputes each node's
///      fixed-point activation along the path, and asserts equality. Returns
///      PASS (true) / FAIL (false). The ABI/calldata layout is finalized in
///      Phase 1 alongside `packages/model`'s openPath(ρ) proof bundle.
interface IVerifier {
    /// @param traceRoot     Poseidon-Merkle root R committed by the provider.
    /// @param weightRoot    Poseidon-Merkle root H_w of the registered model weights.
    /// @param pathProof     ABI-encoded RandPathTest opening (per-node activation,
    ///                      weight row + bias, parent-layer activations, Merkle paths).
    /// @return ok           true = consistent (PASS); false = provable cheat (FAIL).
    function verifyPath(
        bytes32 traceRoot,
        bytes32 weightRoot,
        bytes calldata pathProof
    ) external view returns (bool ok);
}
