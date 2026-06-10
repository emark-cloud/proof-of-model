/**
 * e2e-cheat — the cheat path on Arbitrum Sepolia (§2.3.3).
 *
 *   buyer pays (escrow) → cheat provider commits a CORRUPT R (== buildBadFixture)
 *   → challenger samples paths, one routes through the corrupt node and FAILS
 *   → openChallenge + resolveChallenge → full stake slashed, 10% bounty to the
 *   challenger, buyer refunded.
 *
 * Prints every tx hash + Arbiscan link and asserts the economic outcome. The
 * second half of the Phase-2 acceptance artifact.
 *
 *   pnpm e2e:cheat
 */
import { createProvider, createBuyer, createChallenger } from "@proof/agents";
import { strict as assert } from "node:assert";

import { loadEnv, KEYS, requireEnv, PORTS, DEMO_INPUT, txLink, banner } from "./_env.js";
import { readProvider, readDeposit, decodeEvents, eventArgs, formatEther } from "./_onchain.js";

async function main(): Promise<void> {
  loadEnv();
  banner("e2e-cheat — cheater FAIL → slash + bounty + refund");

  const provider = await createProvider({
    cheat: true,
    port: PORTS.cheat,
    privateKey: requireEnv(KEYS.providerCheat),
  });
  const buyer = createBuyer({ privateKey: requireEnv(KEYS.buyer), rail: "escrow" });
  const challenger = createChallenger({ privateKey: requireEnv(KEYS.challenger) });

  try {
    await provider.ensureRegistered(); // re-bonds stake if a prior run slashed it
    const before = await readProvider(provider.address);
    console.log(`provider   ${provider.address} (stake=${formatEther(before.stake)} ETH, slashed=${before.slashed})`);
    console.log(`buyer      ${buyer.address}`);
    console.log(`challenger ${challenger.address}`);
    assert.ok(before.stake > 0n, "cheat provider must be staked before the run");

    // ── 1. PAY + INFER + COMMIT (corrupt R) ────────────────────────────────────
    banner("1. buyer pays (escrow) → cheat provider commits corrupt R");
    const buy = await buyer.buy({
      providerUrl: provider.url,
      providerAddress: provider.address,
      input: DEMO_INPUT,
    });
    console.log(`requestId  ${buy.requestId}`);
    console.log(`deposit    ${txLink(buy.receipt)}`);
    console.log(`commit     ${txLink(buy.commitTx)}`);

    // ── 2. CHALLENGER SAMPLES → finds a failing path → slashes ─────────────────
    banner("2. challenger samples → failing path → openChallenge + resolve");
    const result = await challenger.run(buy.requestId, provider.url);
    assert.equal(result.cheated, true, "cheat must be caught on some sampled path");
    const { openChallengeTx, resolveTx } = result;
    assert.ok(openChallengeTx, "openChallenge tx must have been submitted");
    assert.ok(resolveTx, "resolve tx must have been submitted");
    console.log(`cheat found on sample #${result.sampleIndex}`);
    console.log(`openChallenge ${txLink(openChallengeTx)}`);
    console.log(`resolve       ${txLink(resolveTx)}`);

    // ── 3. Decode the slash/bounty/refund from the resolve tx ──────────────────
    banner("3. outcome — slash + bounty + refund");
    const events = await decodeEvents(resolveTx);
    const slashed = eventArgs(events, "Slashed");
    const bounty = eventArgs(events, "BountyPaid");
    const refunded = eventArgs(events, "Refunded");
    assert.ok(slashed, "expected a Slashed event");
    assert.ok(refunded, "expected a Refunded event (buyer made whole)");
    console.log(`Slashed    ${formatEther(slashed.amount as bigint)} ETH from ${slashed.provider}`);
    console.log(`BountyPaid ${bounty ? formatEther(bounty.amount as bigint) : "0"} ETH → challenger`);
    console.log(`Refunded   ${formatEther(refunded.amount as bigint)} ETH → buyer ${refunded.buyer}`);

    // ── Assertions ─────────────────────────────────────────────────────────────
    const after = await readProvider(provider.address);
    const deposit = await readDeposit(buy.requestId);
    assert.equal(after.stake, 0n, "full stake must be slashed");
    assert.equal(after.slashed, before.slashed + 1n, "slashed counter must increment");
    assert.equal(after.active, false, "provider deactivated once stake hits zero");
    assert.equal(deposit.amount, 0n, "escrow must be cleared by the refund");
    assert.equal((refunded.buyer as string).toLowerCase(), buyer.address.toLowerCase(), "refund goes to the buyer");

    banner("✅ CHEAT PATH OK");
    console.log(
      `stake ${formatEther(before.stake)} → 0 ETH · slashed ${before.slashed} → ${after.slashed} ·` +
        ` bounty paid · buyer refunded.`
    );
  } finally {
    await provider.close();
  }
}

main().catch((err) => {
  console.error("\n❌ e2e-cheat failed:\n", err);
  process.exit(1);
});
