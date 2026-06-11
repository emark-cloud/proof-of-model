/**
 * discover.ts — permissionless provider discovery (the buyer side of ERC-8004).
 *
 * No directory, no allowlist, no out-of-band config: a buyer reconstructs the live
 * provider set from chain state alone. Scan `ProviderRegistered` for candidate
 * addresses, read each one's CURRENT on-chain record (the event is historical; the
 * struct is authoritative — handles withdraw/re-register), fetch its Agent Card from
 * the on-chain `metadataURI`, and `validateCard` it against that on-chain record.
 * Only providers whose card's identity + weight root match survive; the buyer then
 * has a verified `{address, url}` to call. Ranking is a coarse heuristic — the raw
 * served/challenged/slashed counters travel with each result for callers that want more.
 */
import type { Address, Hex } from "viem";

import { CHAINS, DEPLOY_BLOCK } from "@proof/shared";

import { publicClient, CONTRACTS, registryAbi, NETWORK } from "./chain.js";
import { validateCard, type AgentCard } from "./card.js";

export interface DiscoveredProvider {
  address: Address;
  /** Inference endpoint base URL, taken from the validated Agent Card. */
  url: string;
  weightRoot: Hex;
  stake: bigint;
  active: boolean;
  served: number;
  challenged: number;
  slashed: number;
  /** Coarse ranking score (see `reputationScore`); on-chain counters are authoritative. */
  reputation: number;
  card: AgentCard;
}

export interface DiscoverOptions {
  /** Include providers whose stake was fully slashed (inactive). Default false. */
  includeInactive?: boolean;
  /** Per-card fetch timeout (ms). Default 5000. */
  timeoutMs?: number;
}

/**
 * Coarse discovery ranking: any provider that has ever been slashed sorts last;
 * otherwise rank by requests served. The authoritative reputation is the on-chain
 * counter triple, carried on each result — this is only a default sort order.
 */
export function reputationScore(p: { served: number; slashed: number }): number {
  if (p.slashed > 0) return -1;
  return p.served;
}

type ProviderTuple = readonly [Hex, bigint, boolean, bigint, bigint, bigint, string];

async function fetchCard(uri: string, timeoutMs: number): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(uri, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Discover active providers from chain + their validated Agent Cards, ranked best-first.
 * Throws only on a chain-read failure; a single bad/unreachable card is skipped, not fatal.
 */
export async function discoverProviders(opts: DiscoverOptions = {}): Promise<DiscoveredProvider[]> {
  const { includeInactive = false, timeoutMs = 5000 } = opts;
  const registry = CONTRACTS.Registry;
  const chainId = CHAINS[NETWORK].id;

  // 1. Candidate addresses from registration history (deduped; struct read decides truth).
  const logs = await publicClient.getContractEvents({
    address: registry,
    abi: registryAbi,
    eventName: "ProviderRegistered",
    fromBlock: DEPLOY_BLOCK[NETWORK] ?? 0n,
    toBlock: "latest",
  });
  const candidates = new Set<Address>();
  for (const log of logs) {
    const addr = (log as { args?: { provider?: Address } }).args?.provider;
    if (addr) candidates.add(addr);
  }

  // 2. Hydrate each from current on-chain state, fetch + validate its card.
  const out: DiscoveredProvider[] = [];
  for (const address of candidates) {
    const p = (await publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "providers",
      args: [address],
    })) as ProviderTuple;

    const [weightRoot, stake, active, served, challenged, slashed, metadataURI] = p;
    if (!active && !includeInactive) continue;
    if (!metadataURI) continue; // no advertised card → not discoverable

    const card = await fetchCard(metadataURI, timeoutMs);
    if (!card) continue;
    const verdict = validateCard(card, { agentAddress: address, registry, chainId, weightRoot });
    if (!verdict.ok) continue; // untrusted card — reject (identity/model mismatch)

    const servedN = Number(served);
    const slashedN = Number(slashed);
    out.push({
      address,
      url: (card as AgentCard).url,
      weightRoot,
      stake,
      active,
      served: servedN,
      challenged: Number(challenged),
      slashed: slashedN,
      reputation: reputationScore({ served: servedN, slashed: slashedN }),
      card: card as AgentCard,
    });
  }

  return out.sort((a, b) => b.reputation - a.reputation);
}
