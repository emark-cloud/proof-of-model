/**
 * On-chain log → FeedEvent mapping (the §1.1 vocabulary, design.md §4.3). Pure
 * functions: the §2.3 data hook decodes raw logs into NormalizedLog and feeds them
 * here; messages are composed in the same voice as the placeholder seed so live and
 * backfilled rows read identically.
 *
 * Honesty (phase3-plan §1.1 / CLAUDE.md): on-chain events ONLY. Verified(ok=false)
 * is folded into the Slashed row (no duplicate); Verified(ok=true) is the only path
 * to a green VERIFY pulse — it appears solely when a real challenge resolves PASS.
 * Released/Refunded/Registered are not feed rows (Released feeds the fee stat).
 */
import { formatEther, type Hex } from "viem";
import type { FeedEvent, FeedEventKind } from "./types";

export type ContractKind = "registry" | "challengeManager" | "escrow";

/** A decoded log, normalized across getLogs (backfill) and watchContractEvent (live). */
export interface NormalizedLog {
  contract: ContractKind;
  eventName: string;
  args: Record<string, unknown>;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  /** Filled best-effort from the block header; undefined until fetched. */
  timestamp?: number;
}

export interface MapContext {
  /** addressLower → "PROVIDER_A" | "PROVIDER_B" (registration order). */
  labelFor: (addr: string) => string;
}

const ETH = (wei: unknown) =>
  typeof wei === "bigint" ? `${trim(formatEther(wei))} ETH` : "? ETH";

function trim(s: string): string {
  // Drop trailing zeros for compact display (0.000019000 → 0.000019).
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, ".0") : s;
}

/** `#792c…81ff` — short request id matching the seed's style. */
function shortReq(req: unknown): string {
  const h = String(req ?? "");
  return h.length >= 10 ? `#${h.slice(2, 6)}…${h.slice(-4)}` : `#${h}`;
}

const stableId = (l: NormalizedLog) => `${l.txHash}:${l.logIndex}`;

/**
 * Map one normalized log to a FeedEvent, or null to drop it (not in the feed
 * vocabulary, or folded into another row).
 */
export function logToFeedEvent(
  l: NormalizedLog,
  ctx: MapContext,
): FeedEvent | null {
  const a = l.args;
  const req = a.requestId as Hex | undefined;
  const base = {
    id: stableId(l),
    txHash: l.txHash,
    blockNumber: l.blockNumber,
    timestamp: l.timestamp,
    requestId: req,
  };
  const row = (kind: FeedEventKind, message: string): FeedEvent => ({
    ...base,
    kind,
    message,
  });

  const key = `${l.contract}.${l.eventName}`;
  switch (key) {
    case "escrow.Deposited":
      return row(
        "PAYMENT",
        `BUYER deposited ${ETH(a.amount)} into escrow for ${shortReq(req)}`,
      );
    case "challengeManager.Committed":
      return row(
        "COMMIT",
        `${ctx.labelFor(a.provider as string)} committed trace root R for ${shortReq(req)}`,
      );
    case "challengeManager.ChallengeOpened":
      return row(
        "CHALLENGE",
        `CHALLENGER opened a challenge on ${ctx.labelFor(a.provider as string)} for ${shortReq(req)}`,
      );
    case "challengeManager.Verified":
      // Only the PASS case is its own row; FAIL is carried by Slashed.
      return a.ok === true
        ? row("VERIFY", `VERIFIER: path recomputed ✓ — PASS on ${shortReq(req)}`)
        : null;
    case "challengeManager.Slashed":
      return row(
        "SLASH",
        `VERIFIER: path mismatch ✗ — ${ctx.labelFor(a.provider as string)} SLASHED ${ETH(a.amount)} on ${shortReq(req)}`,
      );
    case "challengeManager.BountyPaid":
      return row(
        "BOUNTY",
        `CHALLENGER earned ${ETH(a.amount)} bounty on ${shortReq(req)}`,
      );
    case "challengeManager.Finalized":
      return row(
        "FINALIZE",
        `Request ${shortReq(req)} finalized — no challenge, fee released to ${ctx.labelFor(a.provider as string)}`,
      );
    default:
      return null; // Released / Refunded / ProviderRegistered / ManagerSet / …
  }
}

/** Newest-first ordering shared by feed + dedupe (blockNumber desc, then id). */
export function byNewest(a: FeedEvent, b: FeedEvent): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
  return a.id < b.id ? 1 : -1;
}
