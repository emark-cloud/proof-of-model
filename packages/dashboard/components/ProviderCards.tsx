"use client";

/**
 * Provider cards — design.md §4.4. Two stacked cards; the side-by-side IS the
 * narrative (one thrives, one is wiped). Each shows stake, a derived reputation bar
 * (lib/reputation.ts — NOT on-chain, phase3-plan §1.3), the served/challenged/slashed
 * counters, the shared model hash H_w, and an ACTIVE/SLASHED status badge (SLASHED
 * pulses red). Pure presentation: §2.3 hydrates these from Registry.providers reads.
 *
 * Key detail (design.md §4.4): both cards carry the SAME H_w — same model advertised,
 * one substitutes cheaper compute. The dashboard makes that visible without narrating.
 */
import { motion } from "framer-motion";
import { explorerAddress } from "@/lib/chain";
import { formatCount, formatEth, truncateHex } from "@/lib/format";
import type { ProviderCardData, ProviderStatus } from "@/lib/types";

export function ProviderCards({ providers }: { providers: ProviderCardData[] }) {
  return (
    <div className="flex flex-col gap-4">
      {providers.map((p) => (
        <ProviderCard key={p.address} p={p} />
      ))}
    </div>
  );
}

function ProviderCard({ p }: { p: ProviderCardData }) {
  const slashed = p.status === "SLASHED";
  const dot = slashed ? "bg-red-slash" : "bg-green-pass shadow-glow-green";

  return (
    <div
      className={`rounded border bg-bg-surface p-4 ${
        slashed ? "border-red-slash/40" : "border-border-accent"
      }`}
    >
      {/* Header: name + status dot, truncated address → Arbiscan */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-sm font-semibold text-text-primary">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          {p.label}
        </span>
        <StatusBadge status={p.status} />
      </div>
      <a
        href={explorerAddress(p.address)}
        target="_blank"
        rel="noreferrer"
        className="mt-0.5 block font-mono text-xs text-text-secondary hover:text-cyan-accent"
      >
        {truncateHex(p.address)}
      </a>

      {/* Stats grid */}
      <dl className="mt-4 grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 font-mono text-sm">
        <dt className="text-text-secondary">Stake</dt>
        <dd className={slashed ? "text-red-slash" : "text-text-primary"}>
          {formatEth(p.stakeWei)}
        </dd>

        <dt className="text-text-secondary">Reputation</dt>
        <dd>
          <ReputationBar score={p.reputation} slashed={slashed} />
        </dd>

        <dt className="text-text-secondary">Served</dt>
        <dd className="text-text-primary tabular-nums">
          {formatCount(p.served)}
        </dd>

        <dt className="text-text-secondary">Challenges</dt>
        <dd className="text-text-primary tabular-nums">
          {formatCount(p.challenged)}
        </dd>

        <dt className="text-text-secondary">Slashes</dt>
        <dd
          className={`tabular-nums ${
            p.slashed > 0 ? "text-red-slash" : "text-green-pass"
          }`}
        >
          {formatCount(p.slashed)}
        </dd>
      </dl>

      {/* Shared model hash — the whole point: same H_w on both cards */}
      <div className="mt-4 border-t border-border-default pt-3 font-mono text-xs">
        <span className="text-text-secondary">Model H_w </span>
        <span className="text-text-dim">{truncateHex(p.weightRoot, 8, 6)}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status === "SLASHED") {
    return (
      <motion.span
        animate={{ opacity: [1, 0.45, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        className="rounded border border-red-slash/50 bg-red-dim px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-red-slash"
      >
        Slashed
      </motion.span>
    );
  }
  return (
    <span className="rounded border border-green-pass/40 bg-green-dim px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-green-pass">
      Active
    </span>
  );
}

function ReputationBar({ score, slashed }: { score: number; slashed: boolean }) {
  const color = slashed ? "bg-red-slash" : "bg-green-pass";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="w-7 text-right tabular-nums text-text-primary">
        {score}
      </span>
    </div>
  );
}
