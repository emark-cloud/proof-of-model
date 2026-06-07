#!/usr/bin/env tsx
/**
 * Generate fixtures.json for the Stylus verifier's Rust unit tests.
 * Run: pnpm --filter @proof/model gen-fixtures
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateFixturesJSON } from "../src/fixtures.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../fixtures.json");

writeFileSync(outPath, generateFixturesJSON(), "utf8");
console.log(`fixtures.json written to ${outPath}`);
