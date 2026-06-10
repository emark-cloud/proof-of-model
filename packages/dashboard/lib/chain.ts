/**
 * Active-chain config — driven by a single env var so the Sepolia → One flip at
 * migrate (phase3-plan §2.7) is one change.
 *
 *   NEXT_PUBLIC_CHAIN    "arbitrumSepolia" (default) | "arbitrumOne"
 *   NEXT_PUBLIC_RPC_URL  optional public RPC override (read-only — NO private keys)
 *
 * Everything chain-shaped (viem chain, deployed addresses, explorer URL, CAIP-2)
 * resolves from here against @proof/shared, the single source of truth.
 */
// viem names Arbitrum One simply `arbitrum` (chain id 42161).
import { arbitrumSepolia, arbitrum as arbitrumOne } from "viem/chains";
import type { Chain } from "viem";
import { CHAINS, ADDRESSES, type ChainKey, type Deployment } from "@proof/shared";

function resolveChainKey(): ChainKey {
  const raw = process.env.NEXT_PUBLIC_CHAIN;
  if (raw === "arbitrumOne" || raw === "arbitrumSepolia") return raw;
  // Default to the dev chain; One is only live after the Phase-3 migrate.
  return "arbitrumSepolia";
}

export const CHAIN_KEY: ChainKey = resolveChainKey();

/** viem chain object for wagmi config. */
export const viemChain: Chain =
  CHAIN_KEY === "arbitrumOne" ? arbitrumOne : arbitrumSepolia;

/** Metadata (name, explorer, CAIP-2) from @proof/shared for the active chain. */
export const chainMeta = CHAINS[CHAIN_KEY];

/** Deployed addresses for the active chain (null entries until that chain is deployed). */
export const addresses: Deployment = ADDRESSES[CHAIN_KEY];

/** Default public RPC per chain; overridable via NEXT_PUBLIC_RPC_URL (read-only). */
const DEFAULT_RPC: Record<ChainKey, string> = {
  arbitrumSepolia: "https://sepolia-rollup.arbitrum.io/rpc",
  arbitrumOne: "https://arb1.arbitrum.io/rpc",
};

export const rpcUrl: string =
  process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC[CHAIN_KEY];

/** Build an Arbiscan link for a tx hash / address on the active chain. */
export function explorerTx(hash: string): string {
  return `${chainMeta.explorer}/tx/${hash}`;
}
export function explorerAddress(addr: string): string {
  return `${chainMeta.explorer}/address/${addr}`;
}
