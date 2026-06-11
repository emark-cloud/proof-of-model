/**
 * _env.ts — shared plumbing for the Phase-2 orchestration scripts (§2.3).
 *
 * One place for: loading the repo-root `.env`, the agent key names, the provider
 * HTTP ports, and Arbiscan link helpers. Kept dependency-free (a tiny dotenv
 * parser) so the scripts stay runnable with bare `tsx scripts/<name>.ts`.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CHAINS, type ChainKey } from "@proof/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo root (scripts/ lives one level down). */
export const ROOT = resolve(__dirname, "..");

/**
 * Minimal `.env` loader — reads repo-root `.env` into `process.env` without a
 * dependency and without clobbering vars already set in the shell. Quoted values
 * are unquoted; `#` comments and blank lines are skipped.
 */
export function loadEnv(): void {
  const file = resolve(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

/** Env var names for the four agent identities. */
export const KEYS = {
  providerHonest: "PROVIDER_HONEST_KEY",
  providerCheat: "PROVIDER_CHEAT_KEY",
  buyer: "BUYER_KEY",
  challenger: "CHALLENGER_KEY",
} as const;

/** HTTP ports for the in-process provider services (distinct per identity). */
export const PORTS = { honest: 8546, cheat: 8547 } as const;

/** Canonical demo input — [1.0, −0.5, 0.25], the model's golden FIXTURE_INPUT. */
export const DEMO_INPUT = [1.0, -0.5, 0.25];

/** Read a required env var, with a pointer to `.env.example` on miss. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v === "0x") {
    throw new Error(`missing env ${name} — copy .env.example to .env and fill it (see resources.md for faucets)`);
  }
  return v;
}

// ─── Network selection ────────────────────────────────────────────────────────
/**
 * Active network key, from the single `PROOF_CHAIN` var (sepolia | one, default
 * sepolia) — kept in lock-step with `@proof/agents` chain.ts so the scripts'
 * explorer links and banners follow the same migrate flip.
 */
export function networkKey(): ChainKey {
  const raw = (process.env.PROOF_CHAIN ?? "sepolia").toLowerCase();
  return raw === "one" || raw === "arbitrumone" || raw === "mainnet"
    ? "arbitrumOne"
    : "arbitrumSepolia";
}

/** Human chain name for banners (`Arbitrum Sepolia` | `Arbitrum One`). */
export const networkName = (): string => CHAINS[networkKey()].name;

// ─── Arbiscan links (active network) ─────────────────────────────────────────
const EXPLORER = CHAINS[networkKey()].explorer;
export const txLink = (hash: string): string => `${EXPLORER}/tx/${hash}`;
export const addrLink = (addr: string): string => `${EXPLORER}/address/${addr}`;

/** Pretty section header for script output. */
export function banner(title: string): void {
  const line = "─".repeat(Math.max(8, title.length + 2));
  console.log(`\n${line}\n ${title}\n${line}`);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
