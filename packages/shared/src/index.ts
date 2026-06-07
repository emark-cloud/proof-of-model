/**
 * @proof/shared — single source of truth for the Proof-of-Model monorepo.
 *
 * Fixed-point Q-format, Poseidon params, network shape, chains + deployed
 * addresses. These constants MUST stay identical across TS, Rust/Stylus, and
 * Solidity (CLAUDE.md critical invariant). Generated ABIs live in ./abis.
 */
export * from "./fixed-point.js";
export * from "./poseidon.js";
export * from "./network.js";
export * from "./addresses.js";
