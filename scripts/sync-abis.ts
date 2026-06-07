/**
 * sync-abis — copy Foundry build ABIs into packages/shared (single source of truth).
 *
 * Reads packages/contracts/out/<Name>.sol/<Name>.json (forge artifacts) and writes
 * packages/shared/src/abis/<Name>.json containing just the ABI array. Run after
 * `forge build`:  pnpm abis:sync
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "packages/contracts/out");
const abiDir = resolve(root, "packages/shared/src/abis");

// Contracts whose ABIs the agents / dashboard consume. Extend as Phase 1/2 land.
const CONTRACTS = ["Registry", "IVerifier"];

let wrote = 0;
for (const name of CONTRACTS) {
  const artifact = resolve(outDir, `${name}.sol`, `${name}.json`);
  if (!existsSync(artifact)) {
    console.warn(`skip ${name}: ${artifact} not found (run \`forge build\` first)`);
    continue;
  }
  const json = JSON.parse(readFileSync(artifact, "utf8")) as { abi: unknown };
  const dest = resolve(abiDir, `${name}.json`);
  writeFileSync(dest, JSON.stringify(json.abi, null, 2) + "\n");
  console.log(`wrote ${dest}`);
  wrote++;
}

console.log(`synced ${wrote}/${CONTRACTS.length} ABIs`);
