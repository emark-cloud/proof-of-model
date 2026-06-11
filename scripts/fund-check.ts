/**
 * fund-check — pre-flight balance assertion for the Phase-2 E2E (§1.5, §2.3).
 *
 * Derives the four agent addresses from the `.env` keys and asserts each holds
 * enough Sepolia ETH for its role before a run: providers need stake + gas, the
 * buyer needs the fee + gas, the challenger needs gas. Exits non-zero if any
 * account is short, with the faucet pointer.
 *
 *   pnpm fund-check
 */
import { formatEther } from "viem";
import type { Address } from "viem";

import { publicClient, makeIdentity, STAKE, FEE } from "@proof/agents";

import { loadEnv, KEYS, requireEnv, addrLink, banner, networkName } from "./_env.js";

/** Generous gas headroom for a couple of txs on Arbitrum Sepolia. */
const GAS_BUFFER = 500_000_000_000_000n; // 0.0005 ETH

interface Role {
  label: string;
  envKey: string;
  /** Minimum balance required for this role. */
  required: bigint;
}

const ROLES: Role[] = [
  { label: "provider:honest", envKey: KEYS.providerHonest, required: STAKE + GAS_BUFFER },
  { label: "provider:cheat", envKey: KEYS.providerCheat, required: STAKE + GAS_BUFFER },
  { label: "buyer", envKey: KEYS.buyer, required: FEE + GAS_BUFFER },
  { label: "challenger", envKey: KEYS.challenger, required: GAS_BUFFER },
];

async function main(): Promise<void> {
  loadEnv();
  banner(`fund-check — ${networkName()} balances`);

  let ok = true;
  for (const role of ROLES) {
    const address = makeIdentity(requireEnv(role.envKey)).address as Address;
    const balance = await publicClient.getBalance({ address });
    const enough = balance >= role.required;
    ok &&= enough;
    console.log(
      `${enough ? "✅" : "❌"} ${role.label.padEnd(16)} ${address}` +
        `  ${formatEther(balance)} ETH (need ≥ ${formatEther(role.required)})`
    );
    console.log(`     ${addrLink(address)}`);
  }

  if (!ok) {
    console.error("\nInsufficient balances. Fund the flagged accounts — faucets in resources.md.");
    process.exit(1);
  }
  console.log("\nAll accounts funded. Ready for `pnpm seed` / `pnpm e2e:happy` / `pnpm e2e:cheat`.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
