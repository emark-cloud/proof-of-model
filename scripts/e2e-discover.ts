/**
 * e2e-discover — permissionless ERC-8004 discovery, end-to-end on Arbitrum Sepolia.
 *
 *   honest provider registers (weightRoot + Agent-Card URI) → buyer is given NO
 *   provider URL/address → it scans the Registry, fetches + validates each Agent
 *   Card, picks the best provider, and pays + infers against the discovered endpoint.
 *
 * This is the acceptance artifact for "permissionless to discover": the buyer starts
 * from chain state alone (no out-of-band config) and still completes a paid call.
 *
 *   pnpm e2e:discover
 */
import { createProvider, createBuyer, discoverProviders } from "@proof/agents";
import { strict as assert } from "node:assert";

import { loadEnv, KEYS, requireEnv, PORTS, DEMO_INPUT, txLink, banner } from "./_env.js";

async function main(): Promise<void> {
  loadEnv();
  banner("e2e-discover — buyer discovers provider on-chain (no URL passed)");

  const provider = await createProvider({
    cheat: false,
    port: PORTS.honest,
    privateKey: requireEnv(KEYS.providerHonest),
  });
  const buyer = createBuyer({ privateKey: requireEnv(KEYS.buyer), rail: "escrow" });

  try {
    await provider.ensureRegistered();
    console.log(`provider   ${provider.address} serving card at ${provider.url}/.well-known/agent-card.json`);
    console.log(`buyer      ${buyer.address}`);

    // ── 1. DISCOVER from chain + validated Agent Cards ─────────────────────────
    banner("1. discoverProviders() — scan Registry, fetch + validate cards");
    const found = await discoverProviders();
    console.log(`discovered ${found.length} provider(s):`);
    for (const p of found) {
      console.log(`  ${p.address}  url=${p.url}  served=${p.served} slashed=${p.slashed} rep=${p.reputation}`);
    }
    const me = found.find((p) => p.address.toLowerCase() === provider.address.toLowerCase());
    assert.ok(me, "honest provider must be discoverable from chain");
    assert.equal(me!.url, provider.url, "discovered URL must match the provider's advertised card URL");

    // ── 2. BUY WITH NO URL — buyer resolves the provider itself ────────────────
    banner("2. buyer.buy() with NO providerUrl → discovery picks the endpoint");
    const buy = await buyer.buy({ input: DEMO_INPUT }); // ← no providerUrl, no providerAddress
    console.log(`requestId  ${buy.requestId}`);
    console.log(`output     [${buy.output.join(", ")}]`);
    console.log(`deposit    ${txLink(buy.receipt)}`);
    console.log(`commit     ${txLink(buy.commitTx)}`);
    assert.ok(buy.commitTx, "a commitment tx must have been produced via the discovered provider");
    assert.equal(buy.output.length, 2, "discovered provider returned the 2-dim model output");

    banner("✅ DISCOVERY OK");
    console.log("Buyer paid + inferred against a provider it found permissionlessly — no out-of-band URL.");
  } finally {
    await provider.close();
  }
}

main().catch((err) => {
  console.error("\n❌ e2e-discover failed:\n", err);
  process.exit(1);
});
