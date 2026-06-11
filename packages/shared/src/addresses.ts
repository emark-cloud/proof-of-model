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
    // ERC-8004 discovery redeploy: Registry.Provider now carries a `metadataURI`
    // Agent-Card pointer (register signature + providers() tuple changed), so the
    // stack was redeployed wired to the same immutable verifier above — the manager's
    // `verifier` is immutable and Registry/Escrow managers are set-once, so the whole
    // stack moves together. finalizeWindow=30s. (Prior Phase-2 set: Registry
    // 0x3519…711b / CM 0xc313…96A3 / Escrow 0x6149…53cd.)
    Registry: "0x7Cded5D29AABF706A838A5905f04659fF7e26905",
    ChallengeManager: "0xEa1De74020BdBaC64159470f69e0E37c40AFBDA0",
    Escrow: "0x6f4CdC30f8F5bd14d60344197d81B96E6a6c4b48",
  },
  arbitrumOne: { ...EMPTY },
};

/**
 * Deploy block per chain — the `fromBlock` anchor for the dashboard's historical
 * backfill (getLogs from here, not genesis: the public RPC can't sweep the full
 * chain). Sepolia: the ERC-8004 discovery Registry deploy (broadcast run-latest,
 * block 276201147); a small margin is shaved off so no early log is missed. Null
 * until the chain is deployed (Arbitrum One pre-migrate).
 */
export const DEPLOY_BLOCK: Record<ChainKey, bigint | null> = {
  arbitrumSepolia: 276201100n,
  arbitrumOne: null,
};
