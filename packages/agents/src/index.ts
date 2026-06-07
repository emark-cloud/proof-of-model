/**
 * @proof/agents — the three actors in the verification game.
 *
 * Phase 0.5 SCAFFOLD (filled in Phase 2):
 *   - provider:   serve inference, commit R + output on-chain, serve openings;
 *                 cheat-mode flag corrupts one neuron on command.
 *   - buyer:      x402 per-inference payment → on-chain receipt.
 *   - challenger: sample a path → demand opening → call Verifier → submit
 *                 challenge → earn bounty.
 */
export * from "./provider.js";
export * from "./buyer.js";
export * from "./challenger.js";
