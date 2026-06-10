"use client";

/**
 * Protocol stats bar — design.md §4.2. A horizontal strip of big count-up numbers
 * over small labels, separated by thin vertical rules. The "at a glance" row judges
 * read first. Pure presentation: takes a ProtocolStats (lib/types.ts); §2.3 feeds it
 * live aggregates from the merged event log + Registry reads.
 */
import { formatEth } from "@/lib/format";
import type { ProtocolStats } from "@/lib/types";
import { CountUp } from "./CountUp";

interface Stat {
  label: string;
  value: number;
  format: (n: number) => string;
}

export function StatsBar({ stats }: { stats: ProtocolStats }) {
  const items: Stat[] = [
    {
      label: "Total Inferences",
      value: stats.totalInferences,
      format: (n) => Math.round(n).toLocaleString("en-US"),
    },
    {
      label: "Challenges Filed",
      value: stats.challengesFiled,
      format: (n) => Math.round(n).toLocaleString("en-US"),
    },
    {
      label: "Slash Rate",
      value: stats.slashRate * 100,
      format: (n) => `${n.toFixed(1)}%`,
    },
    {
      label: "Total Fees",
      // Animate in ETH units; format back to a compact ETH string.
      value: Number(stats.totalFeesWei) / 1e18,
      format: (n) => formatEth(BigInt(Math.round(n * 1e18))),
    },
    {
      label: "Active Providers",
      value: stats.activeProviders,
      format: (n) => Math.round(n).toLocaleString("en-US"),
    },
  ];

  return (
    <div className="flex flex-wrap items-stretch gap-y-4 border-b border-border-default px-6 py-5">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={
            "flex min-w-[7rem] flex-col gap-1 px-8 " +
            (i > 0 ? "border-l border-border-default" : "pl-0")
          }
        >
          <span className="font-mono text-xl tabular-nums text-text-primary md:text-xxl">
            <CountUp value={it.value} format={it.format} />
          </span>
          <span className="font-mono text-xs uppercase tracking-wide text-text-secondary">
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}
