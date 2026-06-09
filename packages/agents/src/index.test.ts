import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";

import { buildGoodFixture, buildBadFixture, FIXTURE_INPUT, CORRUPT_NODE } from "@proof/model";
import { fromFixed } from "@proof/shared";

import { computeInference } from "./provider.js";
import { requestIdOf, outputHashOf, feltToBytes32 } from "./chain.js";
import { findCheatPath, deriveSeed } from "./challenger.js";

// ── provider: corruption matches the golden known-bad fixture ──────────────────
test("computeInference(honest) == buildGoodFixture root", () => {
  const inf = computeInference(FIXTURE_INPUT, false);
  const good = buildGoodFixture();
  assert.equal(inf.traceRoot, good.traceRoot, "honest trace root matches golden good");
  assert.equal(feltToBytes32(inf.traceRoot), feltToBytes32(good.traceRoot));
});

test("computeInference(cheat) == buildBadFixture root (corruption == fixture)", () => {
  const inf = computeInference(FIXTURE_INPUT, true);
  const bad = buildBadFixture();
  assert.equal(inf.traceRoot, bad.traceRoot, "cheat trace root matches golden bad");
  // The corruption is at a hidden layer, so the served output is unchanged.
  assert.deepEqual(inf.output.map(fromFixed), buildGoodFixture().output.map(fromFixed));
});

test("outputHash binds the (unchanged) output regardless of cheat flag", () => {
  const honest = computeInference(FIXTURE_INPUT, false);
  const cheat = computeInference(FIXTURE_INPUT, true);
  assert.equal(honest.outputHash, cheat.outputHash);
  assert.equal(honest.outputHash, outputHashOf(honest.output));
});

// ── requestId derivation is stable + nonce-sensitive ───────────────────────────
test("requestIdOf is deterministic and nonce-sensitive", () => {
  const buyer = "0x1111111111111111111111111111111111111111" as Address;
  const provider = "0x2222222222222222222222222222222222222222" as Address;
  const a = requestIdOf(buyer, provider, 7n);
  const b = requestIdOf(buyer, provider, 7n);
  const c = requestIdOf(buyer, provider, 8n);
  assert.equal(a, b, "same inputs → same requestId");
  assert.notEqual(a, c, "different nonce → different requestId");
  assert.match(a, /^0x[0-9a-f]{64}$/, "32-byte hex");
});

// ── challenger: multi-sample loop catches the cheat, passes the honest case ─────
const REQ = "0x" + "ab".repeat(32) as Hex;
const ROOT = "0x" + "cd".repeat(32) as Hex;
const CH = "0x3333333333333333333333333333333333333333" as Address;

// Mock open: encodes the sampled path's h1 into the proof so the mock verify can see it.
const openEncodingH1 = async (spec: { h1: number }): Promise<Hex> =>
  (`0x${spec.h1.toString(16).padStart(2, "0")}`) as Hex;

// Mock verify mimicking the Stylus oracle over a known-bad trace: a path FAILS iff
// it routes through the corrupt node (h1 == CORRUPT_NODE.index).
const verifyCheat = async (_t: Hex, _w: Hex, pathProof: Hex): Promise<boolean> => {
  const h1 = parseInt(pathProof.slice(2), 16);
  return h1 !== CORRUPT_NODE.index;
};

// Mock verify for an honest trace: every path passes.
const verifyHonest = async (): Promise<boolean> => true;

test("findCheatPath catches a one-node cheat within K samples", async () => {
  const r = await findCheatPath({
    requestId: REQ,
    traceRoot: ROOT,
    weightRoot: ROOT,
    challenger: CH,
    samples: 64,
    open: openEncodingH1,
    verify: verifyCheat,
  });
  assert.equal(r.found, true, "a path through the corrupt node was found");
  assert.equal(r.spec?.h1, CORRUPT_NODE.index, "the failing path routes through the corrupt node");
});

test("findCheatPath passes an honest provider (no failing path)", async () => {
  const r = await findCheatPath({
    requestId: REQ,
    traceRoot: ROOT,
    weightRoot: ROOT,
    challenger: CH,
    samples: 64,
    open: openEncodingH1,
    verify: verifyHonest,
  });
  assert.equal(r.found, false, "honest provider is never challenged");
});

test("deriveSeed / samplePath is deterministic", () => {
  assert.equal(deriveSeed(REQ, ROOT, CH, 3), deriveSeed(REQ, ROOT, CH, 3));
  assert.notEqual(deriveSeed(REQ, ROOT, CH, 3), deriveSeed(REQ, ROOT, CH, 4));
});
