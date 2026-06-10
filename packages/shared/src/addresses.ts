/**
 * Deployed contract addresses — SINGLE SOURCE OF TRUTH.
 *
 * Populated by deploy scripts (scripts/deploy). Dev/dev work happens on Arbitrum
 * Sepolia; the x402 payment rail and the final migration target are Arbitrum One
 * (CDP has no Sepolia support — see CLAUDE.md locked decisions).
 */

export const CHAINS = {
  arbitrumSepolia: {
    id: 421614,
    caip2: "eip155:421614",
    name: "Arbitrum Sepolia",
    explorer: "https://sepolia.arbiscan.io",
  },
  arbitrumOne: {
    id: 42161,
    caip2: "eip155:42161",
    name: "Arbitrum One",
    explorer: "https://arbiscan.io",
  },
} as const;

export type ChainKey = keyof typeof CHAINS;

export interface Deployment {
  Verifier: `0x${string}` | null;
  Registry: `0x${string}` | null;
  ChallengeManager: `0x${string}` | null;
  Escrow: `0x${string}` | null;
}

const EMPTY: Deployment = {
  Verifier: null,
  Registry: null,
  ChallengeManager: null,
  Escrow: null,
};

/** Deployed addresses per chain. Filled in by deploy scripts; null until deployed. */
export const ADDRESSES: Record<ChainKey, Deployment> = {
  arbitrumSepolia: {
    // Phase-2 redeploy: current Stylus source with the ABI-signature fix — Rust
    // verify_path now takes bytes32/bytes (was U256/Vec<u8>, which Stylus exposed as
    // uint256/uint8[], a selector mismatch vs IVerifier that reverted every call).
    // The original d52f6b0 deploy (0xd46e…a057) had the same latent mismatch.
    Verifier: "0xe19dfd6abae5b0b815dd6b3d8f90126fe68b79ae",
    // Phase-2 redesign (requestId lifecycle + Escrow impl), finalizeWindow=30s.
    // Redeployed wired to the fixed verifier above — the manager's `verifier` is
    // immutable and Registry/Escrow managers are set-once, so the whole stack moves.
    Registry: "0x35198835f689e05bB363f09472360b5D9a44711b",
    ChallengeManager: "0xc3135c7DbB5EcB87a4F99a538318d968079e96A3",
    Escrow: "0x6149f5fB00ec427727e67DD51E7278ED0Bf553cd",
  },
  arbitrumOne: { ...EMPTY },
};
