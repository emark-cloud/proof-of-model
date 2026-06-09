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
    Verifier: "0xd46e05f62b3a384bcf585f3c0247df080af8a057",
    // Phase-2 redesign (requestId lifecycle + Escrow impl), finalizeWindow=30s.
    Registry: "0xdda1b5edde69DEa1E0bd07801e444Ee2F76E10cc",
    ChallengeManager: "0xff0BF72ce6C64ccAC8E9107fbC8bEaBCD46CE740",
    Escrow: "0x5a64E86A4689fB22233e3eE3B2e3384c8533cF59",
  },
  arbitrumOne: { ...EMPTY },
};
