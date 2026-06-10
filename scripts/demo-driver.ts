/**
 * demo-driver — the continuous live stream behind the spectator dashboard (§2.3.5 /
 * phase3-plan §1.2). The Phase-2 e2e-happy/e2e-cheat scripts are single-shot; the
 * dashboard needs a *stream*. This loops, against the deployed chain, so the feed
 * and provider cards move on camera:
 *
 *   every cycle   → buyer pays honest provider → commit → finalize (green cadence)
 *   every Nth      → buyer pays the CHEAT provider → challenger catches it → SLASH
 *                    (the red moment), then re-bond the cheat's stake for next time
 *
 * The driver only GENERATES on-chain events (same agents as Phase 2); the dashboard
 * merely renders them. finalizeWindow=30s (already deployed) paces each green cycle
 * so it completes within the demo. Ctrl-C stops cleanly.
 *
 *   pnpm demo:driver               # default cadence (cheat every 4th cycle)
 *   CHEAT_EVERY=3 pnpm demo:driver
 */
import { createProvider, createBuyer, createChallenger } from "@proof/agents";

import { loadEnv, KEYS, requireEnv, PORTS, DEMO_INPUT, txLink, banner, sleep } from "./_env.js";
import { waitForFinalizeWindow, finalizeRequest, readProvider, formatEther } from "./_onchain.js";

const CHEAT_EVERY = Number(process.env.CHEAT_EVERY ?? "4"); // cheat on every Nth cycle
const PAUSE_MS = Number(process.env.PAUSE_MS ?? "4000"); // breather between cycles

async function main(): Promise<void> {
  loadEnv();
  banner("demo-driver — continuous honest cadence + interval cheat (Ctrl-C to stop)");

  const honest = await createProvider({
    cheat: false,
    port: PORTS.honest,
    privateKey: requireEnv(KEYS.providerHonest),
  });
  const cheat = await createProvider({
    cheat: true,
    port: PORTS.cheat,
    privateKey: requireEnv(KEYS.providerCheat),
  });
  const buyer = createBuyer({ privateKey: requireEnv(KEYS.buyer), rail: "escrow" });
  const challenger = createChallenger({ privateKey: requireEnv(KEYS.challenger) });

  await honest.ensureRegistered();
  await cheat.ensureRegistered();
  console.log(`honest     ${honest.address}`);
  console.log(`cheat      ${cheat.address}`);
  console.log(`buyer      ${buyer.address}`);
  console.log(`challenger ${challenger.address}`);
  console.log(`cadence    cheat every ${CHEAT_EVERY} cycles\n`);

  let stop = false;
  const onSig = () => {
    if (stop) return;
    stop = true;
    console.log("\n⏹  stopping after this cycle…");
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  let cycle = 0;
  try {
    while (!stop) {
      cycle++;
      const doCheat = cycle % CHEAT_EVERY === 0;
      if (doCheat) await runCheatCycle(cheat, buyer, challenger, cycle);
      else await runHonestCycle(honest, buyer, challenger, cycle);
      if (!stop) await sleep(PAUSE_MS);
    }
  } finally {
    await honest.close();
    await cheat.close();
    banner(`demo-driver stopped after ${cycle} cycles`);
  }
}

/** Honest: pay → commit → all paths PASS (off-chain) → finalize → fee released (green). */
async function runHonestCycle(
  provider: Awaited<ReturnType<typeof createProvider>>,
  buyer: ReturnType<typeof createBuyer>,
  challenger: ReturnType<typeof createChallenger>,
  cycle: number,
): Promise<void> {
  banner(`cycle ${cycle} · HONEST`);
  const buy = await buyer.buy({
    providerUrl: provider.url,
    providerAddress: provider.address,
    input: DEMO_INPUT,
  });
  console.log(`  pay+commit  ${buy.requestId.slice(0, 10)}… · ${txLink(buy.commitTx)}`);

  const insp = await challenger.inspect(buy.requestId, provider.url);
  if (insp.cheated) {
    console.warn("  ⚠ honest provider unexpectedly failed a path — skipping finalize");
    return;
  }
  console.log("  sampled     all paths PASS — no challenge");

  await waitForFinalizeWindow(buy.requestId);
  const finalizeTx = await finalizeRequest(buy.requestId, requireEnv(KEYS.buyer));
  console.log(`  finalize    fee released · ${txLink(finalizeTx)}`);
}

/** Cheat: pay → commit corrupt R → challenger catches a failing path → SLASH (red). */
async function runCheatCycle(
  provider: Awaited<ReturnType<typeof createProvider>>,
  buyer: ReturnType<typeof createBuyer>,
  challenger: ReturnType<typeof createChallenger>,
  cycle: number,
): Promise<void> {
  banner(`cycle ${cycle} · CHEAT`);
  // Re-bond if a prior cheat cycle wiped the stake (slash deactivates the provider).
  await provider.ensureRegistered();
  const before = await readProvider(provider.address);

  const buy = await buyer.buy({
    providerUrl: provider.url,
    providerAddress: provider.address,
    input: DEMO_INPUT,
  });
  console.log(`  pay+commit  ${buy.requestId.slice(0, 10)}… (corrupt R) · ${txLink(buy.commitTx)}`);

  const result = await challenger.run(buy.requestId, provider.url);
  if (!result.cheated || !result.resolveTx) {
    console.warn("  ⚠ cheat not caught this cycle (path missed the corrupt node) — no slash");
    return;
  }
  const after = await readProvider(provider.address);
  console.log(`  SLASH       sample #${result.sampleIndex} · ${txLink(result.resolveTx)}`);
  console.log(
    `  outcome     stake ${formatEther(before.stake)} → ${formatEther(after.stake)} ETH · slashed ${before.slashed} → ${after.slashed} · bounty paid`,
  );
}

main().catch((err) => {
  console.error("\n❌ demo-driver failed:\n", err);
  process.exit(1);
});
