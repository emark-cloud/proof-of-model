import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dotBiasShift,
  relu,
  feltFromFixed,
  verifyMerkleProof,
  merkleProof,
  merkleRoot,
  poseidonMany,
  traceLeafIndex,
  weightLeafIndex,
  LAYER_SIZES,
  SCALE,
} from "@proof/shared";
import {
  SHAPE,
  WEIGHTS,
  BIASES,
  rowLeaf,
  weightRoot,
  forward,
  commit,
  openPath,
  encodePathProof,
  decodePathProof,
  samplePath,
  buildGoodFixture,
  buildBadFixture,
  FIXTURE_INPUT,
  CORRUPT_NODE,
} from "./index.js";

// ---------------------------------------------------------------------------
// Basic shape invariant (regression guard from Phase 0.5)
// ---------------------------------------------------------------------------

test("model exposes the locked 3→8→4→2 shape", () => {
  assert.deepEqual([...SHAPE.LAYER_SIZES], [3, 8, 4, 2]);
  assert.equal(SHAPE.ACTIVATIONS.at(-1), "identity");
});

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

test("WEIGHTS dimensions match network shape", () => {
  assert.equal(WEIGHTS.length, 3);
  for (let l = 0; l < 3; l++) {
    const L = l + 1;
    assert.equal(WEIGHTS[l]!.length, LAYER_SIZES[L]);
    for (let j = 0; j < LAYER_SIZES[L]!; j++) {
      assert.equal(WEIGHTS[l]![j]!.length, LAYER_SIZES[L - 1]);
    }
  }
});

test("BIASES dimensions match network shape", () => {
  assert.equal(BIASES.length, 3);
  for (let l = 0; l < 3; l++) {
    const L = l + 1;
    assert.equal(BIASES[l]!.length, LAYER_SIZES[L]);
  }
});

test("weights are in Q47.16 range [-1, 1)", () => {
  for (let l = 0; l < 3; l++) {
    for (const row of WEIGHTS[l]!) {
      for (const w of row) {
        assert.ok(w >= -SCALE, `weight ${w} below -SCALE`);
        assert.ok(w < SCALE, `weight ${w} >= SCALE`);
      }
    }
  }
});

test("biases are in Q47.16 range [-0.5, 0.5)", () => {
  for (let l = 0; l < 3; l++) {
    for (const b of BIASES[l]!) {
      assert.ok(b >= -(SCALE / 2n), `bias ${b} below -SCALE/2`);
      assert.ok(b < SCALE / 2n, `bias ${b} >= SCALE/2`);
    }
  }
});

test("weightRoot is stable across calls", () => {
  assert.equal(weightRoot(), weightRoot());
});

test("rowLeaf is stable across calls", () => {
  assert.equal(rowLeaf(1, 0), rowLeaf(1, 0));
  assert.equal(rowLeaf(2, 2), rowLeaf(2, 2));
  assert.equal(rowLeaf(3, 1), rowLeaf(3, 1));
});

test("all weight row Merkle proofs verify against weightRoot", () => {
  const leaves: bigint[] = Array.from({ length: 14 }, () => 0n);
  for (let L = 1; L <= 3; L++) {
    for (let j = 0; j < LAYER_SIZES[L]!; j++) {
      leaves[weightLeafIndex(L, j)] = rowLeaf(L, j);
    }
  }
  const hw = merkleRoot(leaves);
  assert.equal(hw, weightRoot());
  for (let L = 1; L <= 3; L++) {
    for (let j = 0; j < LAYER_SIZES[L]!; j++) {
      const proof = merkleProof(leaves, weightLeafIndex(L, j));
      assert.ok(
        verifyMerkleProof(rowLeaf(L, j), proof, hw),
        `rowLeaf(${L},${j}) proof failed`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Forward pass
// ---------------------------------------------------------------------------

test("forward: output is deterministic", () => {
  const r1 = forward(FIXTURE_INPUT);
  const r2 = forward(FIXTURE_INPUT);
  assert.deepEqual(r1.output, r2.output);
  assert.deepEqual(r1.trace, r2.trace);
});

test("forward: trace shape matches network", () => {
  const { trace } = forward(FIXTURE_INPUT);
  assert.equal(trace.length, 4);
  assert.deepEqual(trace.map(l => l.length), [3, 8, 4, 2]);
});

test("forward: trace[0] equals the input", () => {
  const { trace } = forward(FIXTURE_INPUT);
  assert.deepEqual(trace[0], FIXTURE_INPUT);
});

test("forward: output equals trace[3]", () => {
  const { trace, output } = forward(FIXTURE_INPUT);
  assert.deepEqual(output, trace[3]);
});

test("forward: layer-1 node-0 activation matches manual dotBiasShift + relu", () => {
  const { trace } = forward(FIXTURE_INPUT);
  const expected = relu(dotBiasShift(WEIGHTS[0]![0]!, FIXTURE_INPUT, BIASES[0]![0]!));
  assert.equal(trace[1]![0], expected);
});

test("forward: layer-2 node-0 activation matches manual dotBiasShift + relu", () => {
  const { trace } = forward(FIXTURE_INPUT);
  const expected = relu(dotBiasShift(WEIGHTS[1]![0]!, trace[1]!, BIASES[1]![0]!));
  assert.equal(trace[2]![0], expected);
});

test("forward: not all outputs are zero (non-degenerate network)", () => {
  const { output } = forward(FIXTURE_INPUT);
  assert.ok(output.some(v => v !== 0n), "all outputs zero — likely a bug");
});

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

test("commit: trace root is stable across calls", () => {
  const { trace } = forward(FIXTURE_INPUT);
  assert.equal(commit(trace), commit(trace));
});

test("commit: mutating a leaf changes the root", () => {
  const { trace } = forward(FIXTURE_INPUT);
  const rootBefore = commit(trace);
  const mutated = trace.map(l => [...l]);
  mutated[1]![0]! += 1n;
  assert.notEqual(commit(mutated), rootBefore);
});

test("commit: all activation leaves verify against the trace root", () => {
  const { trace } = forward(FIXTURE_INPUT);
  const total = LAYER_SIZES.reduce((a: number, b: number) => a + b, 0);
  const leaves: bigint[] = Array.from({ length: total }, () => 0n);
  for (let layer = 0; layer < trace.length; layer++) {
    for (let i = 0; i < trace[layer]!.length; i++) {
      leaves[traceLeafIndex(layer, i)] = feltFromFixed(trace[layer]![i]!);
    }
  }
  const R = merkleRoot(leaves);
  assert.equal(R, commit(trace));
  for (let layer = 0; layer < trace.length; layer++) {
    for (let i = 0; i < trace[layer]!.length; i++) {
      const leaf = feltFromFixed(trace[layer]![i]!);
      const proof = merkleProof(leaves, traceLeafIndex(layer, i));
      assert.ok(verifyMerkleProof(leaf, proof, R), `leaf(${layer},${i}) proof failed`);
    }
  }
});

// ---------------------------------------------------------------------------
// samplePath
// ---------------------------------------------------------------------------

test("samplePath: indices are within bounds", () => {
  for (let seed = 0n; seed < 10n; seed++) {
    const spec = samplePath(seed);
    assert.ok(spec.output >= 0 && spec.output < LAYER_SIZES[3]!);
    assert.ok(spec.h2 >= 0 && spec.h2 < LAYER_SIZES[2]!);
    assert.ok(spec.h1 >= 0 && spec.h1 < LAYER_SIZES[1]!);
  }
});

test("samplePath: deterministic for the same seed", () => {
  assert.deepEqual(samplePath(0n), samplePath(0n));
  assert.deepEqual(samplePath(7n), samplePath(7n));
});

// ---------------------------------------------------------------------------
// openPath + Merkle proofs (good fixture)
// ---------------------------------------------------------------------------

test("good fixture: all weight proofs verify against H_w", () => {
  const f = buildGoodFixture();
  for (const node of f.proof.nodes) {
    const leaf = poseidonMany([...node.weightRow, node.bias]);
    assert.ok(
      verifyMerkleProof(leaf, node.weightProof, f.weightRoot),
      `weight proof failed for layer ${node.layer} node ${node.nodeIndex}`
    );
  }
});

test("good fixture: all nodeActivation proofs verify against R", () => {
  const f = buildGoodFixture();
  for (const node of f.proof.nodes) {
    assert.ok(
      verifyMerkleProof(node.nodeActivation, node.nodeActProof, f.traceRoot),
      `nodeAct proof failed for layer ${node.layer} node ${node.nodeIndex}`
    );
  }
});

test("good fixture: all parentAct proofs verify against R", () => {
  const f = buildGoodFixture();
  for (const node of f.proof.nodes) {
    for (let i = 0; i < node.parentActs.length; i++) {
      assert.ok(
        verifyMerkleProof(node.parentActs[i]!, node.parentActProofs[i]!, f.traceRoot),
        `parentAct[${i}] proof failed for layer ${node.layer} node ${node.nodeIndex}`
      );
    }
  }
});

test("good fixture: rowLeaf committed to H_w matches poseidonMany of opened row+bias", () => {
  const f = buildGoodFixture();
  const hw = weightRoot();
  assert.equal(f.weightRoot, hw);
  for (const node of f.proof.nodes) {
    const computed = poseidonMany([...node.weightRow, node.bias]);
    assert.equal(computed, rowLeaf(node.layer, node.nodeIndex));
  }
});

// ---------------------------------------------------------------------------
// Known-bad fixture: corrupt activation → verifier would fail
// ---------------------------------------------------------------------------

test("bad fixture: corrupt node activation != honest recompute (verifier would FAIL)", () => {
  const bad = buildBadFixture();
  const { trace: honestTrace } = forward(FIXTURE_INPUT);

  // The corrupt node is at CORRUPT_NODE.layer (1), CORRUPT_NODE.index (0)
  // It's the LAST node in proof.nodes (path is output→input, so L=1 is nodes[2])
  const corruptNode = bad.proof.nodes[2]!;
  assert.equal(corruptNode.layer, 1);
  assert.equal(corruptNode.nodeIndex, CORRUPT_NODE.index);

  // The honest activation at this position
  const honestFelt = feltFromFixed(honestTrace[1]![CORRUPT_NODE.index]!);
  // The committed (corrupt) activation
  const corruptFelt = corruptNode.nodeActivation;
  assert.notEqual(honestFelt, corruptFelt, "corrupt and honest activations should differ");
});

test("bad fixture: corrupt trace root differs from honest trace root", () => {
  const good = buildGoodFixture();
  const bad = buildBadFixture();
  assert.notEqual(bad.traceRoot, good.traceRoot);
});

test("bad fixture: weight root is the same (real H_w committed)", () => {
  const good = buildGoodFixture();
  const bad = buildBadFixture();
  assert.equal(bad.weightRoot, good.weightRoot);
});

test("bad fixture: corrupt nodeActivation leaf verifies against corrupt traceRoot", () => {
  // The provider committed R over the corrupt trace — the corrupt leaf IS a valid
  // opening of that root. The verifier catches the cheat via the recompute mismatch,
  // not by an invalid Merkle proof.
  const bad = buildBadFixture();
  const corruptNode = bad.proof.nodes[2]!;
  assert.ok(
    verifyMerkleProof(corruptNode.nodeActivation, corruptNode.nodeActProof, bad.traceRoot),
    "corrupt leaf should still open correctly from the corrupt root"
  );
});

// ---------------------------------------------------------------------------
// Encode / decode round-trip
// ---------------------------------------------------------------------------

test("encode→decode round-trip: node fields are identical", () => {
  const f = buildGoodFixture();
  const bytes = encodePathProof(f.proof);
  const decoded = decodePathProof(bytes, f.traceRoot, f.weightRoot);

  assert.equal(decoded.nodes.length, f.proof.nodes.length);
  for (let t = 0; t < f.proof.nodes.length; t++) {
    const orig = f.proof.nodes[t]!;
    const dec = decoded.nodes[t]!;
    assert.equal(dec.layer, orig.layer, `layer mismatch at t=${t}`);
    assert.equal(dec.nodeIndex, orig.nodeIndex);
    assert.equal(dec.nodeActivation, orig.nodeActivation);
    assert.equal(dec.bias, orig.bias);
    assert.deepEqual(dec.weightRow, orig.weightRow);
    assert.deepEqual(dec.parentActs, orig.parentActs);
  }
});

test("encode→decode round-trip: Merkle proofs are identical", () => {
  const f = buildGoodFixture();
  const bytes = encodePathProof(f.proof);
  const decoded = decodePathProof(bytes, f.traceRoot, f.weightRoot);

  for (let t = 0; t < f.proof.nodes.length; t++) {
    const orig = f.proof.nodes[t]!;
    const dec = decoded.nodes[t]!;
    assert.deepEqual(dec.weightProof, orig.weightProof);
    assert.deepEqual(dec.nodeActProof, orig.nodeActProof);
    assert.deepEqual(dec.parentActProofs, orig.parentActProofs);
  }
});

test("decoded proofs verify against roots", () => {
  const f = buildGoodFixture();
  const bytes = encodePathProof(f.proof);
  const decoded = decodePathProof(bytes, f.traceRoot, f.weightRoot);

  for (const node of decoded.nodes) {
    assert.ok(verifyMerkleProof(node.nodeActivation, node.nodeActProof, decoded.traceRoot));
    const wLeaf = poseidonMany([...node.weightRow, node.bias]);
    assert.ok(verifyMerkleProof(wLeaf, node.weightProof, decoded.weightRoot));
    for (let i = 0; i < node.parentActs.length; i++) {
      assert.ok(verifyMerkleProof(node.parentActs[i]!, node.parentActProofs[i]!, decoded.traceRoot));
    }
  }
});
