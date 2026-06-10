import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { EventFeed } from "@/components/EventFeed";
import { ProviderCards } from "@/components/ProviderCards";
import { DEMO_EVENTS, DEMO_STATS, DEMO_PROVIDERS } from "@/lib/demo-data";

/**
 * Read-only spectator dashboard (CLAUDE.md invariant): NO user actions beyond an
 * optional wallet connect. Three-zone single-page layout (design.md §3): header,
 * protocol stats bar, then feed (≈60%) beside provider cards (≈40%).
 *
 * Phase-3 §2.2 — the components are wired to the PLACEHOLDER seed (lib/demo-data.ts,
 * the real Phase-2 Sepolia history). §2.3 swaps the seed for the live data layer
 * (watchContractEvent + backfill + Registry reads) without touching a component.
 */
export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <StatsBar stats={DEMO_STATS} />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[3fr_2fr]">
        {/* Live event feed — the hero (≈60%) */}
        <div className="min-h-0">
          <EventFeed events={DEMO_EVENTS} />
        </div>

        {/* Provider cards — the side-by-side narrative (≈40%) */}
        <aside className="min-h-0 overflow-y-auto">
          <ProviderCards providers={DEMO_PROVIDERS} />
        </aside>
      </main>
    </div>
  );
}
