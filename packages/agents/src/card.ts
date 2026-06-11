/**
 * card.ts — the ERC-8004 "Agent Card": the off-chain JSON a provider serves at
 * `<url>/.well-known/agent-card.json` and points to on-chain via the Registry's
 * `metadataURI`. It is how a buyer discovers a provider permissionlessly: scan
 * `ProviderRegistered`, read the URI, fetch this card, learn the inference endpoint.
 *
 * The card is UNTRUSTED advertising. The chain stays authoritative: `validateCard`
 * cross-checks the card against on-chain state (weight root + this provider's
 * identity + the registry it claims), so a card cannot impersonate another provider
 * or advertise a model it did not commit to. A lying card is simply rejected; even
 * one that slips through only routes the buyer to a server whose on-chain commitment
 * remains challengeable — endpoint *authenticity* (signing to the committed key) is
 * the next rung, see CLAUDE.md roadmap. Pure (no chain / no HTTP) so it unit-tests.
 */
import type { Address, Hex } from "viem";

/** Canonical well-known path the provider serves its card at (ERC-8004 / A2A convention). */
export const WELL_KNOWN_PATH = "/.well-known/agent-card.json";

/** The card URI stored on-chain for a provider reachable at `baseUrl`. */
export function cardUriFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}${WELL_KNOWN_PATH}`;
}

/** One on-chain registration this card claims — binds the card to an agent identity. */
export interface CardRegistration {
  chainId: number;
  registry: Address;
  agentAddress: Address;
}

/** ERC-8004 / A2A-style Agent Card for a Proof-of-Model inference provider. */
export interface AgentCard {
  name: string;
  description?: string;
  /** Base URL of the provider's inference service (where /infer and /open live). */
  url: string;
  endpoints: { infer: string; open: string };
  /** Trust models this agent participates in — Proof-of-Model fraud proofs here. */
  trustModels: string[];
  model: { weightRoot: Hex; arch: string; qFormat: string };
  /** On-chain registrations claimed by this card (cross-checked at discovery). */
  registrations: CardRegistration[];
}

export interface BuildCardParams {
  url: string;
  agentAddress: Address;
  registry: Address;
  chainId: number;
  weightRoot: Hex;
  name?: string;
  description?: string;
}

/** Assemble a provider's Agent Card from its identity + the model it commits to. */
export function buildAgentCard(p: BuildCardParams): AgentCard {
  return {
    name: p.name ?? `proof-of-model-provider-${p.agentAddress.slice(2, 8)}`,
    description:
      p.description ??
      "Verifiable inference — deterministic 3-8-4-2 fixed-point net, Poseidon-Merkle committed.",
    url: p.url,
    endpoints: { infer: "/infer", open: "/open" },
    trustModels: ["proof-of-model"],
    model: { weightRoot: p.weightRoot, arch: "3-8-4-2", qFormat: "i64" },
    registrations: [{ chainId: p.chainId, registry: p.registry, agentAddress: p.agentAddress }],
  };
}

/** What a discovered card MUST agree with — the authoritative on-chain facts. */
export interface CardExpectation {
  agentAddress: Address;
  registry: Address;
  chainId: number;
  weightRoot: Hex;
}

export interface CardValidation {
  ok: boolean;
  reason?: string;
}

const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Cross-check an untrusted card against authoritative on-chain state. Rejects a card
 * that (a) is malformed, (b) advertises a model weight root other than the one this
 * provider committed to, or (c) carries no registration binding it to THIS provider
 * address on THIS registry+chain. This is what makes discovery trustless: the URL is
 * the only thing the buyer takes on faith, and only after identity+model match.
 */
export function validateCard(card: unknown, expect: CardExpectation): CardValidation {
  if (!card || typeof card !== "object") return { ok: false, reason: "card is not an object" };
  const c = card as Partial<AgentCard>;

  if (typeof c.url !== "string" || !/^https?:\/\//.test(c.url)) {
    return { ok: false, reason: "card.url missing or not http(s)" };
  }
  if (!c.model || typeof c.model.weightRoot !== "string") {
    return { ok: false, reason: "card.model.weightRoot missing" };
  }
  if (!eq(c.model.weightRoot, expect.weightRoot)) {
    return { ok: false, reason: "card weightRoot != on-chain weightRoot" };
  }
  if (!Array.isArray(c.registrations) || c.registrations.length === 0) {
    return { ok: false, reason: "card has no registrations" };
  }
  const bound = c.registrations.some(
    (r) =>
      r &&
      typeof r.agentAddress === "string" &&
      typeof r.registry === "string" &&
      r.chainId === expect.chainId &&
      eq(r.agentAddress, expect.agentAddress) &&
      eq(r.registry, expect.registry),
  );
  if (!bound) {
    return { ok: false, reason: "no registration binds this provider/registry/chain" };
  }
  return { ok: true };
}
