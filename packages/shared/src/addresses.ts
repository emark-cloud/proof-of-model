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
    Verifier: null, // CI-gated: fill after `cargo stylus deploy` on Rust machine (Phase 1 §2.3)
    Registry: "0x8DA25285875A8CaFd665254bf70d160356D5866c",
    ChallengeManager: "0x54BD1Fe0F5641d082a851Bb92fB79C07f913d254",
    Escrow: "0xB1Ecc2F593339e4787E497bE22cD0554D52fC2Ce",
  },
  arbitrumOne: { ...EMPTY },
};
