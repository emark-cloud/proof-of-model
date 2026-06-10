/**
 * Reputation — a documented, client-side function of the on-chain Registry counters
 * (served / challenged / slashed). phase3-plan §1.3: do NOT invent an on-chain
 * reputation curve; the spec's reputation IS the counters. This is purely a display
 * derivation for the provider card's progress bar (design.md §4.4).
 *
 * Shape: sustained honest service saturates toward 100; every slash is a brutal,
 * near-disqualifying penalty — which mirrors the economics (a fully-slashed provider
 * has its stake wiped and is out). Bounded to [0,100].
 */
export const SLASH_PENALTY = 45;

export function reputationScore({
  served,
  slashed,
}: {
  served: number;
  slashed: number;
}): number {
  // Saturating service score: 1 call → 50, many calls → ~100. Never reaches 100
  // on its own, leaving headroom so an unblemished veteran reads as "near-perfect".
  const service = 100 * (served / (served + 1));
  const penalty = slashed * SLASH_PENALTY;
  return clamp(Math.round(service - penalty), 0, 100);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
