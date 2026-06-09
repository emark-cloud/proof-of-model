/**
 * @proof/agents — the three actors in the verification game (Phase 2, §2.2).
 *
 *   - provider:   serve inference, commit R + outputHash on-chain, serve openings;
 *                 cheat-mode flag corrupts one neuron (== buildBadFixture).
 *   - buyer:      pay per inference (escrow rail on Sepolia; x402 rail deferred).
 *   - challenger: multi-sample a path → demand opening → eth_call verifyPath →
 *                 openChallenge + resolveChallenge → earn bounty.
 *
 * Shared chain access (viem clients, contracts, requestId helpers) lives in chain.ts.
 */
export * from "./chain.js";
export * from "./provider.js";
export * from "./buyer.js";
export * from "./challenger.js";
