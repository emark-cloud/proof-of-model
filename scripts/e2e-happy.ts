/**
 * e2e-happy — the honest path on Arbitrum Sepolia (§2.3.2).
 *
 *   buyer pays (escrow) → honest provider commits R → challenger samples K paths,
 *   all PASS (no challenge) → after the finalize window, finalize releases the fee
 *   to the provider minus the 5% protocol cut and bumps `served`.
 *
 * Prints every tx hash + Arbiscan link and asserts the economic outcome. This is
 * half of the Phase-2 acceptance artifact (the other half is e2e-cheat).
 *
 *   pnpm e2e:happy
 */
import { createProvider, createBuyer, createChallenger } from "@proof/agents";
import { strict as assert } from "node:assert";

import { loadEnv, KEYS, requireEnv, PORTS, DEMO_INPUT, txLink, banner } from "./_env.js";
import {
  readProvider,
  readDeposit,
  waitForFinalizeWindow,
  finalizeRequest,
  decodeEvents,
  eventArgs,
  formatEther,
} from "./_onchain.js";

async function main(): Promise<void> {
  loadEnv();
  banner("e2e-happy — honest provider PASS → fee released");

  const provider = await createProvider({
    cheat: false,
    port: PORTS.honest,
    privateKey: requireEnv(KEYS.providerHonest),
  });
  const buyer = createBuyer({ privateKey: requireEnv(KEYS.buyer), rail: "escrow" });
  const challenger = createChallenger({ privateKey: requireEnv(KEYS.challenger) });

  try {
    await provider.ensureRegistered();
    const before = await readProvider(provider.address);
    console.log(`provider   ${provider.address} (served=${before.served})`);
    console.log(`buyer      ${buyer.address}`);
    console.log(`challenger ${challenger.address}`);

    // ── 1. PAY + INFER + COMMIT ────────────────────────────────────────────────
    banner("1. buyer pays (escrow) → provider runs + commits R");
    const buy = await buyer.buy({
      providerUrl: provider.url,
      providerAddress: provider.address,
      input: DEMO_INPUT,
    });
    console.log(`requestId  ${buy.requestId}`);
    console.log(`output     [${buy.output.join(", ")}]`);
    console.log(`deposit    ${txLink(buy.receipt)}`);
    console.log(`commit     ${txLink(buy.commitTx)}`);

    // ── 2. CHALLENGER SAMPLES — honest ⇒ every path PASSES ─────────────────────
    banner("2. challenger samples paths (eth_call verifyPath)");
    const insp = await challenger.inspect(buy.requestId, provider.url);
    assert.equal(insp.cheated, false, "honest provider must pass every sampled path");
    console.log(`✅ all sampled paths PASS — no challenge (provider is honest)`);

    // ── 3. FINALIZE after the window → fee released ────────────────────────────
    banner("3. finalize after window → release fee minus protocol cut");
    await waitForFinalizeWindow(buy.requestId);
    const finalizeTx = await finalizeRequest(buy.requestId, requireEnv(KEYS.buyer));
    console.log(`finalize   ${txLink(finalizeTx)}`);

    const events = await decodeEvents(finalizeTx);
    const released = eventArgs(events, "Released");
    assert.ok(released, "expected a Released event");
    console.log(
      `Released   payout ${formatEther(released.amount as bigint)} ETH` +
        ` · protocol cut ${formatEther(released.protocolCut as bigint)} ETH`
    );

    // ── Assertions ─────────────────────────────────────────────────────────────
    const after = await readProvider(provider.address);
    const deposit = await readDeposit(buy.requestId);
    assert.equal(after.served, before.served + 1n, "served counter must increment");
    assert.equal(deposit.amount, 0n, "escrow deposit must be cleared on release");

    banner("✅ HAPPY PATH OK");
    console.log(`served ${before.served} → ${after.served} · escrow cleared · provider paid.`);
  } finally {
    await provider.close();
  }
}

main().catch((err) => {
  console.error("\n❌ e2e-happy failed:\n", err);
  process.exit(1);
});
