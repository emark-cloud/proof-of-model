/**
 * seed — register + stake both provider identities (§2.3.1).
 *
 * Idempotent: each provider only registers if not already active in the Registry
 * (a previously-slashed cheat is re-registered, re-bonding stake). Prints the
 * resulting on-chain Registry state so a run starts from a known baseline.
 *
 *   pnpm seed
 */
import { createProvider } from "@proof/agents";

import { loadEnv, KEYS, requireEnv, PORTS, addrLink, banner } from "./_env.js";
import { readProvider, formatEther } from "./_onchain.js";

async function seedOne(label: string, cheat: boolean, port: number, envKey: string): Promise<void> {
  const provider = await createProvider({ cheat, port, privateKey: requireEnv(envKey) });
  try {
    const beforeActive = (await readProvider(provider.address)).active;
    await provider.ensureRegistered();
    const st = await readProvider(provider.address);
    console.log(
      `${cheat ? "🔴" : "🟢"} ${label.padEnd(16)} ${provider.address}` +
        ` ${beforeActive ? "(already active)" : "(registered + staked)"}`
    );
    console.log(
      `     stake ${formatEther(st.stake)} ETH · active ${st.active} ·` +
        ` served ${st.served} · challenged ${st.challenged} · slashed ${st.slashed}`
    );
    console.log(`     ${addrLink(provider.address)}`);
  } finally {
    await provider.close();
  }
}

async function main(): Promise<void> {
  loadEnv();
  banner("seed — register + stake providers (Arbitrum Sepolia)");
  await seedOne("provider:honest", false, PORTS.honest, KEYS.providerHonest);
  await seedOne("provider:cheat", true, PORTS.cheat, KEYS.providerCheat);
  console.log("\nProviders staked. Run `pnpm e2e:happy` then `pnpm e2e:cheat`.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
