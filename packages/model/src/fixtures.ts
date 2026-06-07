/**
 * Golden test fixtures — the CONTRACT for the Stylus verifier.
 *
 * CRITICAL INVARIANT: these fixtures are consumed by both TS tests (this package)
 * and Rust unit tests (packages/stylus). Any change here invalidates both.
 * Run `pnpm gen-fixtures` after any model change to regenerate fixtures.json.
 *
 * Two fixtures:
 *
 *   knownGood — honest trace; verifier MUST return true.
 *     Provider runs the real model, commits R over the honest trace, keeps real H_w.
 *     Every recompute on the path matches the opened activation.
 *
 *   knownBad — one corrupt activation; verifier MUST return false (for the right path).
 *     Provider flips layer-1 node 0 activation, rebuilds R over the corrupt trace,
 *     keeps the real H_w. The verifier recomputes using real weights + honest parent
 *     activations (input layer is uncorrupted) and gets the honest result, which ≠
 *     the corrupt opened activation → FAIL.
 *
 *     NOTE (soundness / the ~1/N bound): a path that does NOT pass through the corrupt
 *     node (i.e. h1 ≠ 0) would pass the single-round check. Multi-sample (multiple
 *     independent paths) is what drives detection probability up to ~1 − (1−1/N)^k.
 *     This is the paper's RandPathTest — not a bug in the protocol.
 */

import { toFixed, feltFromFixed, LAYER_SIZES } from "@proof/shared";
import { forward } from "./forward.js";
import { commit } from "./commit.js";
import { weightRoot as buildWeightRoot } from "./weights.js";
import { openPath, encodePathProof, samplePath, type PathSpec, type PathProof } from "./path.js";

// ---------------------------------------------------------------------------
// Canonical fixture inputs
// ---------------------------------------------------------------------------

/** Canonical input vector: [1.0, −0.5, 0.25] in Q47.16. */
export const FIXTURE_INPUT = [toFixed(1.0), toFixed(-0.5), toFixed(0.25)];

/** Canonical good-path spec derived from seed 0. */
export const FIXTURE_PATH_SPEC: PathSpec = samplePath(0n);

/**
 * Bad fixture uses a path explicitly through the corrupt node (layer 1, node 0).
 * The ~1/N bound means any path with h1 ≠ 0 would pass — that is correct behavior.
 */
export const BAD_FIXTURE_PATH_SPEC: PathSpec = {
  output: FIXTURE_PATH_SPEC.output,
  h2: FIXTURE_PATH_SPEC.h2,
  h1: 0,
};

/** The corrupt node's coordinates (layer 1, index 0). */
export const CORRUPT_NODE = { layer: 1, index: 0 } as const;

// ---------------------------------------------------------------------------
// Computed once at module load (cheap; deterministic)
// ---------------------------------------------------------------------------

const HW_ROOT = buildWeightRoot();

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

export type Fixture = {
  input: typeof FIXTURE_INPUT;
  trace: ReturnType<typeof forward>["trace"];
  output: ReturnType<typeof forward>["output"];
  traceRoot: bigint;
  weightRoot: bigint;
  pathSpec: PathSpec;
  proof: PathProof;
  pathProofBytes: Uint8Array;
};

/** Honest trace — verifier must PASS. */
export function buildGoodFixture(): Fixture {
  const { trace, output } = forward(FIXTURE_INPUT);
  const traceRoot = commit(trace);
  const proof = openPath(FIXTURE_PATH_SPEC, trace, traceRoot, HW_ROOT);
  const pathProofBytes = encodePathProof(proof);
  return { input: FIXTURE_INPUT, trace, output, traceRoot, weightRoot: HW_ROOT, pathSpec: FIXTURE_PATH_SPEC, proof, pathProofBytes };
}

/** Corrupt trace (layer 1 node 0 flipped) — verifier must FAIL for BAD_FIXTURE_PATH_SPEC. */
export function buildBadFixture(): Fixture {
  const { trace: honestTrace } = forward(FIXTURE_INPUT);
  // Deep-copy and flip one activation
  const trace = honestTrace.map(layer => [...layer]);
  trace[CORRUPT_NODE.layer]![CORRUPT_NODE.index]! += 1000n; // arbitrary non-zero delta

  const traceRoot = commit(trace); // R committed over corrupt trace
  // H_w is real — provider has to expose real weights on-chain
  const proof = openPath(BAD_FIXTURE_PATH_SPEC, trace, traceRoot, HW_ROOT);
  const pathProofBytes = encodePathProof(proof);
  return {
    input: FIXTURE_INPUT,
    trace,
    output: trace[trace.length - 1]!,
    traceRoot,
    weightRoot: HW_ROOT,
    pathSpec: BAD_FIXTURE_PATH_SPEC,
    proof,
    pathProofBytes,
  };
}

// ---------------------------------------------------------------------------
// JSON serialisation for Rust test consumption
// ---------------------------------------------------------------------------

function hexBig(n: bigint): string {
  return "0x" + n.toString(16);
}

function hexFixed(n: bigint): string {
  // Signed i64 as hex — Rust parses with i64::from_str_radix (base 16) after stripping sign.
  if (n < 0n) return "-0x" + (-n).toString(16);
  return "0x" + n.toString(16);
}

function serializeProof(p: { siblings: bigint[]; dirs: number[] }) {
  return {
    siblings: p.siblings.map(hexBig),
    dirs: p.dirs,
  };
}

function fixtureToObject(f: Fixture) {
  return {
    input: f.input.map(hexFixed),
    traceRoot: hexBig(f.traceRoot),
    weightRoot: hexBig(f.weightRoot),
    output: f.output.map(hexFixed),
    pathSpec: f.pathSpec,
    pathProofHex: "0x" + Array.from(f.pathProofBytes, b => b.toString(16).padStart(2, "0")).join(""),
    nodes: f.proof.nodes.map(n => ({
      layer: n.layer,
      nodeIndex: n.nodeIndex,
      nodeActivation: hexBig(n.nodeActivation),
      bias: hexBig(n.bias),
      weightRow: n.weightRow.map(hexBig),
      parentActs: n.parentActs.map(hexBig),
      weightProof: serializeProof(n.weightProof),
      nodeActProof: serializeProof(n.nodeActProof),
      parentActProofs: n.parentActProofs.map(serializeProof),
    })),
  };
}

/**
 * Generate the JSON object consumed by Rust unit tests. Write with gen-fixtures script.
 * Includes both known-good and known-bad fixtures, plus metadata.
 */
export function generateFixturesJSON(): string {
  const good = buildGoodFixture();
  const bad = buildBadFixture();
  const data = {
    meta: {
      description: "Golden fixtures for the Proof-of-Model Stylus verifier",
      network: "3->8->4->2",
      weightSeed: hexBig(42n),
      corruptNode: CORRUPT_NODE,
      soundnessNote:
        "knownBad path goes through the corrupt node (layer 1 node 0). " +
        "A path with h1 != 0 would pass (the ~1/N bound is correct protocol behavior, not a bug).",
    },
    knownGood: fixtureToObject(good),
    knownBad: fixtureToObject(bad),
  };
  return JSON.stringify(data, null, 2);
}
