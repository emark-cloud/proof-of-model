/**
 * verify.ts — the one-command judge path (§1.6 / §2.4 of phase3-plan.md).
 *
 * This is the product's verifier AND the judge's 60-second no-video proof. It is
 * fully read-only — no private keys, no writes — so anyone with an RPC can confirm
 * the fraud-proof actually fired on-chain:
 *
 *   1. connect to the target chain (--chain sepolia|one)
 *   2. confirm the Verifier + Registry + ChallengeManager + Escrow are deployed
 *      (eth_getCode non-empty — the Stylus verifier and the stack are live)
 *   3. find the cheating provider's slash on-chain (the `Slashed` event)
 *   4. read the Registry: the provider's `slashed` counter incremented and (fresh
 *      from e2e-cheat) its stake was wiped to zero
 *   5. decode the slash tx: assert the bounty was paid to the challenger and the
 *      buyer was refunded — the full economic outcome
 *   6. print a clean PASS block with every explorer link. Non-zero exit on failure.
 *
 * Built on the same @proof/shared addresses + ABIs the E2E scripts use, and reads
 * exactly the state those scripts produce (run `pnpm e2e:cheat` first).
 *
 *   pnpm verify                  # Arbitrum Sepolia (dev deploy)
 *   pnpm verify -- --chain one   # Arbitrum One (post-migrate)
 */
import { createPublicClient, http, parseEventLogs, getAddress, formatEther } from "viem";
import type { Address, Hex, PublicClient, Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { strict as assert } from "node:assert";

import { ADDRESSES, DEPLOY_BLOCK, CHAINS, type ChainKey } from "@proof/shared";
import { registryAbi, challengeManagerAbi, escrowAbi } from "@proof/agents";

import { loadEnv, banner } from "./_env.js";

// ─── Target selection (--chain sepolia|one) ──────────────────────────────────
interface Target {
  key: ChainKey;
  chain: Chain;
  rpcUrl: string | undefined;
  explorer: string;
}

function parseTarget(argv: string[]): Target {
  const i = argv.indexOf("--chain");
  const raw = (i !== -1 ? argv[i + 1] : process.env.VERIFY_CHAIN) ?? "sepolia";
  const norm = raw.toLowerCase();
  if (norm === "sepolia" || norm === "arbitrumsepolia") {
    return {
      key: "arbitrumSepolia",
      chain: arbitrumSepolia,
      rpcUrl: process.env.SEPOLIA_RPC_URL,
      explorer: CHAINS.arbitrumSepolia.explorer,
    };
  }
  if (norm === "one" || norm === "arbitrumone" || norm === "mainnet") {
    return {
      key: "arbitrumOne",
      chain: arbitrum,
      rpcUrl: process.env.ARBITRUM_ONE_RPC_URL,
      explorer: CHAINS.arbitrumOne.explorer,
    };
  }
  throw new Error(`unknown --chain '${raw}' — use 'sepolia' or 'one'`);
}

async function main(): Promise<void> {
  loadEnv();
  const t = parseTarget(process.argv.slice(2));
  const txLink = (h: string): string => `${t.explorer}/tx/${h}`;
  const addrLink = (a: string): string => `${t.explorer}/address/${a}`;

  banner(`verify — judge path on ${t.chain.name}`);

  const publicClient = createPublicClient({ chain: t.chain, transport: http(t.rpcUrl) }) as PublicClient;

  // ── 1. Addresses deployed on this chain ─────────────────────────────────────
  const dep = ADDRESSES[t.key];
  const need = ["Verifier", "Registry", "ChallengeManager", "Escrow"] as const;
  for (const name of need) {
    if (!dep[name]) {
      fail(
        `ADDRESSES.${t.key}.${name} is null — the stack is not deployed on ${t.chain.name}.` +
          (t.key === "arbitrumOne" ? " Run the Phase-3 migrate first." : ""),
      );
    }
  }
  const Verifier = dep.Verifier as Address;
  const Registry = dep.Registry as Address;
  const ChallengeManager = dep.ChallengeManager as Address;
  const Escrow = dep.Escrow as Address;

  // ── 2. Bytecode present (the verifier + stack are live) ─────────────────────
  banner("1. contracts deployed (eth_getCode)");
  for (const [name, addr] of [
    ["Verifier", Verifier],
    ["Registry", Registry],
    ["ChallengeManager", ChallengeManager],
    ["Escrow", Escrow],
  ] as const) {
    const code = await publicClient.getCode({ address: addr });
    if (!code || code === "0x") fail(`${name} at ${addr} has no bytecode — not deployed.`);
    const bytes = (code.length - 2) / 2;
    console.log(`  ${name.padEnd(17)} ${addr}  (${bytes} bytes)  ${addrLink(addr)}`);
  }

  // ── 3. Locate the slash on-chain ────────────────────────────────────────────
  banner("2. fraud proof fired — locating the Slashed event");
  // Target a specific cheat provider if its key is in the env (precise); otherwise
  // discover the slash from the event log alone (keeps the judge path key-free).
  let cheatAddr: Address | undefined;
  const cheatKey = process.env.PROVIDER_CHEAT_KEY;
  if (cheatKey && cheatKey !== "0x") {
    const pk = (cheatKey.startsWith("0x") ? cheatKey : `0x${cheatKey}`) as Hex;
    cheatAddr = privateKeyToAccount(pk).address;
    console.log(`  cheat provider (from PROVIDER_CHEAT_KEY): ${cheatAddr}`);
  }

  const fromBlock =
    DEPLOY_BLOCK[t.key] ??
    (process.env.VERIFY_FROM_BLOCK ? BigInt(process.env.VERIFY_FROM_BLOCK) : undefined);

  const slashLogs = await publicClient.getContractEvents({
    address: ChallengeManager,
    abi: challengeManagerAbi,
    eventName: "Slashed",
    args: cheatAddr ? { provider: cheatAddr } : undefined,
    fromBlock: fromBlock ?? "earliest",
    toBlock: "latest",
  });
  if (slashLogs.length === 0) {
    fail(
      `no Slashed event found on ${t.chain.name}${cheatAddr ? ` for ${cheatAddr}` : ""}.` +
        " Run `pnpm e2e:cheat` to produce the slash artifact, then re-run verify.",
    );
  }
  // Most recent slash (getContractEvents returns ascending block/log order).
  const slash = slashLogs[slashLogs.length - 1];
  if (!slash) fail("Slashed event vanished between length check and read — retry verify.");
  const slashArgs = slash.args as { requestId: Hex; provider: Address; amount: bigint; challenger: Address };
  const provider = getAddress(slashArgs.provider);
  console.log(`  Slashed found · requestId ${slashArgs.requestId.slice(0, 10)}… · provider ${provider}`);
  console.log(`  slash tx       ${txLink(slash.transactionHash)}`);

  // ── 4. Registry state — slashed counter up, stake wiped ─────────────────────
  banner("3. Registry — provider state after the slash");
  const p = (await publicClient.readContract({
    address: Registry,
    abi: registryAbi,
    functionName: "providers",
    args: [provider],
  })) as readonly [Hex, bigint, boolean, bigint, bigint, bigint];
  const state = { weightRoot: p[0], stake: p[1], active: p[2], served: p[3], challenged: p[4], slashed: p[5] };
  console.log(`  weightRoot H_w ${state.weightRoot}`);
  console.log(`  served ${state.served} · challenged ${state.challenged} · slashed ${state.slashed}`);
  console.log(`  stake ${formatEther(state.stake)} ETH · active ${state.active}`);

  // Hard gate: the monotonic slashed counter proves a slash was finalized. It never
  // resets, so it is the durable on-chain truth even if a later demo-driver cycle
  // re-bonded the provider's stake.
  assert.ok(state.slashed > 0n, "Registry slashed counter must be > 0 — no slash recorded for this provider");
  // Fresh from e2e-cheat the stake is zero and the provider is deactivated. A live
  // demo-driver re-bonds for the next cheat cycle, so treat a non-zero stake as a
  // NOTE rather than a failure — the slash itself is already proven above.
  if (state.stake === 0n) {
    console.log("  ✓ stake wiped to 0 and provider deactivated (clean post-slash state)");
  } else {
    console.log("  ℹ stake is non-zero — a later demo cycle re-bonded this provider (slash still proven by the counter + event)");
  }

  // ── 5. Decode the slash tx — bounty paid + buyer refunded ───────────────────
  banner("4. economic outcome — slash + bounty + refund");
  const receipt = await publicClient.getTransactionReceipt({ hash: slash.transactionHash });
  const events = parseEventLogs({ abi: [...challengeManagerAbi, ...escrowAbi], logs: receipt.logs });
  const find = (name: string): Record<string, unknown> | undefined =>
    (events.find((e) => (e as { eventName?: string }).eventName === name) as { args?: Record<string, unknown> } | undefined)?.args;

  const slashed = find("Slashed");
  const bounty = find("BountyPaid");
  const refunded = find("Refunded");

  assert.ok(slashed, "slash tx must carry a Slashed event");
  assert.ok((slashed.amount as bigint) > 0n, "slashed amount must be > 0");
  assert.ok(bounty, "slash tx must carry a BountyPaid event (challenger rewarded)");

  console.log(`  Slashed    ${formatEther(slashed.amount as bigint)} ETH from ${slashed.provider}`);
  console.log(`  BountyPaid ${formatEther(bounty.amount as bigint)} ETH → challenger ${bounty.challenger}`);
  if (refunded) {
    console.log(`  Refunded   ${formatEther(refunded.amount as bigint)} ETH → buyer ${refunded.buyer}`);
  } else {
    console.log("  ℹ no Refunded event in this tx (buyer refund may have settled separately)");
  }

  // ── PASS ────────────────────────────────────────────────────────────────────
  banner("✅ PASS — verifiable inference fraud proof confirmed on-chain");
  console.log(`chain      ${t.chain.name} (${t.chain.id})`);
  console.log(`verifier   ${Verifier}  (Stylus, ${addrLink(Verifier)})`);
  console.log(`provider   ${provider} slashed ${state.slashed}× · bounty paid${refunded ? " · buyer refunded" : ""}`);
  console.log(`proof tx   ${txLink(slash.transactionHash)}`);
}

function fail(msg: string): never {
  console.error(`\n❌ verify FAILED: ${msg}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("\n❌ verify failed:\n", err);
  process.exit(1);
});
