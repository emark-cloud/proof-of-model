/**
 * Display formatting — truncation, time, value formatting (design.md §4). Pure
 * functions, no chain access. Shared by every §2.2 component so hashes/addresses
 * truncate identically everywhere.
 */
import { formatEther, type Hex } from "viem";

/** `0x792c…81ff` — keep head+tail, elide the middle (design.md §4.3/§4.4). */
export function truncateHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** `12:04:31` monospace wall-clock from a ms-epoch timestamp (local time). */
export function formatClock(ms: number | undefined): string {
  if (ms === undefined) return "--:--:--";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Compact ETH amount from wei, e.g. `2.0 ETH` / `0.0001 ETH` (testnet uses ETH). */
export function formatEth(wei: bigint, maxFractionDigits = 4): string {
  const eth = Number(formatEther(wei));
  // Trim to a few significant fractional digits without scientific notation.
  const s = eth.toLocaleString("en-US", {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: eth === 0 ? 1 : 0,
  });
  return `${s} ETH`;
}

/** Thousands-separated integer for the stats bar (design.md §4.2). */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** `23.7%` — slash rate etc. */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Arbiscan tx URL helper re-export point (explorer base lives in lib/chain.ts). */
export type { Hex };
