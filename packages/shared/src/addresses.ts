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
  arbitrumSepolia: { ...EMPTY },
  arbitrumOne: { ...EMPTY },
};
