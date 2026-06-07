import { LAYER_SIZES, MAX_WIDTH, CHAINS } from "@proof/shared";

// Read-only spectator mode (CLAUDE.md invariant): NO user actions beyond an
// optional wallet connect. Phase 3 adds the live event feed, provider cards,
// and stats bar (design.md). This is the Phase 0.5 scaffold landing page.
export default function Home() {
  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", padding: "3rem", maxWidth: 760 }}>
      <h1>Proof-of-Model</h1>
      <p>
        Verifiable-inference marketplace for the agent economy on Arbitrum. Providers
        commit to <em>which model they ran</em>; challengers spot-check a random
        output→input path and slash provable cheats.
      </p>
      <p style={{ color: "#888" }}>
        Spectator dashboard — Phase 0.5 scaffold. Live feed, provider cards, and stats
        bar arrive in Phase 3.
      </p>
      <ul>
        <li>Network: {LAYER_SIZES.join(" → ")} (max width N = {MAX_WIDTH})</li>
        <li>Dev chain: {CHAINS.arbitrumSepolia.name}</li>
        <li>x402 rail / final: {CHAINS.arbitrumOne.name}</li>
      </ul>
    </main>
  );
}
