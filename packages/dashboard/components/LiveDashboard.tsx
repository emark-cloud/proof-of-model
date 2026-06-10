"use client";

/**
 * The live three-zone body (§2.3): subscribes via useProtocolData and renders the
 * §2.2 components with on-chain data. When the active chain isn't deployed yet
 * (Arbitrum One pre-migrate) it falls back to the placeholder seed so the narrative
 * still shows — Sepolia is live, One lights up at migrate. Read-only throughout.
 */
import { StatsBar } from "./StatsBar";
import { EventFeed } from "./EventFeed";
import { ProviderCards } from "./ProviderCards";
import { useProtocolData } from "@/lib/useProtocolData";
import { isDeployed } from "@/lib/contracts";
import { DEMO_EVENTS, DEMO_STATS, DEMO_PROVIDERS } from "@/lib/demo-data";

export function LiveDashboard() {
  const live = useProtocolData();

  // Pre-migrate chains have no deploy → show the seed (the real Phase-2 history).
  const usingLive = isDeployed;
  const events = usingLive ? live.events : DEMO_EVENTS;
  const stats = usingLive ? live.stats : DEMO_STATS;
  const providers =
    usingLive && live.providers.length > 0 ? live.providers : DEMO_PROVIDERS;

  return (
    <>
      <StatsBar stats={stats} />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[3fr_2fr]">
        {/* Live event feed — the hero (≈60%) */}
        <div className="min-h-0">
          <EventFeed
            events={events}
            status={
              <ConnectionDot
                live={usingLive}
                connected={live.connected}
                ready={live.ready}
                count={events.length}
              />
            }
          />
        </div>

        {/* Provider cards — the side-by-side narrative (≈40%) */}
        <aside className="min-h-0 overflow-y-auto">
          <ProviderCards providers={providers} />
        </aside>
      </main>
    </>
  );
}

function ConnectionDot({
  live,
  connected,
  ready,
  count,
}: {
  live: boolean;
  connected: boolean;
  ready: boolean;
  count: number;
}) {
  const label = !live
    ? "seed"
    : !ready
      ? "syncing…"
      : connected
        ? "live"
        : "offline";
  const dot = !live
    ? "bg-text-dim"
    : connected
      ? "bg-green-pass shadow-glow-green"
      : "bg-amber-pending";
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-text-secondary">
      <span>{count} events</span>
      <span className="text-text-dim">·</span>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
