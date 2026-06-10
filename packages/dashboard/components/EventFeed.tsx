"use client";

/**
 * Live event feed — the hero (design.md §4.3). A reverse-chronological terminal log:
 * `[timestamp] [BADGE] [icon] message [tx →]`. Colored pills per the §1.1 mapping
 * (lib/feed-meta.ts). SLASH rows flash a full-width red glow; VERIFY(pass) rows get a
 * green border pulse. New rows fade/slide in from the top (Framer Motion).
 *
 * Pure presentation: takes the merged FeedEvent[] (newest-first is handled here by
 * sorting on blockNumber). §2.3 supplies the live + backfilled stream.
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { explorerTx } from "@/lib/chain";
import { FEED_META } from "@/lib/feed-meta";
import { formatClock, truncateHex } from "@/lib/format";
import type { FeedEvent } from "@/lib/types";

export function EventFeed({
  events,
  status,
}: {
  events: FeedEvent[];
  /** Right-aligned header slot (connection indicator); defaults to event count. */
  status?: ReactNode;
}) {
  // Newest first. Stable: blockNumber desc, then id desc for same-block ordering.
  const ordered = [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber)
      return a.blockNumber > b.blockNumber ? -1 : 1;
    return a.id < b.id ? 1 : -1;
  });

  return (
    <section className="flex h-full flex-col overflow-hidden rounded border border-border-default bg-bg-surface">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-text-primary">
          Live Event Feed<span className="cursor-blink" />
        </h2>
        <span className="font-mono text-xs text-text-secondary">
          {status ?? `${ordered.length} events`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {ordered.map((ev) => (
            <FeedRow key={ev.id} ev={ev} />
          ))}
        </AnimatePresence>
        {ordered.length === 0 && (
          <p className="px-4 py-8 text-center font-mono text-sm text-text-dim">
            waiting for on-chain events…
          </p>
        )}
      </div>
    </section>
  );
}

function FeedRow({ ev }: { ev: FeedEvent }) {
  const meta = FEED_META[ev.kind];
  const drama =
    meta.drama === "slash"
      ? "shadow-glow-red border-l-2 border-l-red-slash bg-red-dim"
      : meta.drama === "pass"
        ? "animate-pulse-green border-l-2 border-l-green-pass"
        : "border-l-2 border-l-transparent";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex items-center gap-3 border-b border-border-default px-4 py-2 ${drama}`}
    >
      <time className="w-[4.5rem] shrink-0 font-mono text-xs text-text-dim tabular-nums">
        {formatClock(ev.timestamp)}
      </time>

      <span
        className={`inline-flex w-[5.5rem] shrink-0 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${meta.pill}`}
      >
        {meta.label}
      </span>

      <span className="w-4 shrink-0 text-center font-mono text-sm text-text-secondary">
        {meta.icon}
      </span>

      <span className={`min-w-0 flex-1 truncate font-mono text-sm ${meta.text}`}>
        {ev.message}
      </span>

      <a
        href={explorerTx(ev.txHash)}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 font-mono text-xs text-cyan-accent hover:underline"
        title="View on Arbiscan"
      >
        {truncateHex(ev.txHash)} →
      </a>
    </motion.div>
  );
}
