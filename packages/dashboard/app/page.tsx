import { Header } from "@/components/Header";
import { LiveDashboard } from "@/components/LiveDashboard";

/**
 * Read-only spectator dashboard (CLAUDE.md invariant): NO user actions beyond an
 * optional wallet connect. Three-zone single-page layout (design.md §3): header,
 * then the live body (stats bar + feed beside provider cards).
 *
 * Phase-3 §2.3 — the body (LiveDashboard) subscribes to chain via useProtocolData
 * (backfill + watchContractEvent + Registry reads), filling the §2.2 components with
 * on-chain data. Falls back to the Phase-2 seed on a not-yet-deployed chain.
 */
export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <LiveDashboard />
    </div>
  );
}
