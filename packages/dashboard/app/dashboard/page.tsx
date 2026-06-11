import { Header } from "@/components/Header";
import { DemoControl } from "@/components/DemoControl";
import { LiveDashboard } from "@/components/LiveDashboard";

/**
 * Spectator dashboard (lives at /dashboard — the landing page at / is the explainer).
 * Layout (design.md §3): header, a slim collapsible demo bar, then the live body
 * (stats bar + feed beside provider cards). The demo bar is one row collapsed
 * (title · status · ▶ RUN DEMO) and expands for the flow explainer + driver log, so
 * it never crowds the feed.
 *
 * Read-only re: the PROTOCOL — no submit-challenge / manual-slash; a human cannot
 * participate (CLAUDE.md / design.md §9). The one control (DemoControl) starts/stops
 * the off-chain AGENT driver server-side; the agents still do all protocol work.
 *
 * Phase-3 §2.3 — the body (LiveDashboard) subscribes to chain via useProtocolData
 * (backfill + watchContractEvent + Registry reads), filling the §2.2 components with
 * on-chain data. Falls back to the Phase-2 seed on a not-yet-deployed chain.
 */
export default function DashboardPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <DemoControl />
      <LiveDashboard />
    </div>
  );
}
