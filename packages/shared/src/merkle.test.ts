import { test } from "node:test";
import assert from "node:assert/strict";
import { poseidon2 } from "./poseidon.js";
import {
  poseidonMany,
  nextPowerOfTwo,
  merkleRoot,
  merkleProof,
  verifyMerkleProof,
  traceLeafIndex,
  weightLeafIndex,
} from "./merkle.js";
import { LAYER_SIZES } from "./network.js";

// ---------------------------------------------------------------------------
// poseidonMany
// ---------------------------------------------------------------------------

test("poseidonMany: single element returns it unchanged", () => {
  assert.equal(poseidonMany([42n]), 42n);
  assert.equal(poseidonMany([0n]), 0n);
});

test("poseidonMany: two elements equals poseidon2", () => {
  const a = 1n, b = 2n;
  assert.equal(poseidonMany([a, b]), poseidon2(a, b));
});

test("poseidonMany: three elements is left-fold poseidon2", () => {
  const [a, b, c] = [1n, 2n, 3n];
  const expected = poseidon2(poseidon2(a, b), c);
  assert.equal(poseidonMany([a, b, c]), expected);
});

test("poseidonMany: throws on empty input", () => {
  assert.throws(() => poseidonMany([]), /empty/i);
});

// ---------------------------------------------------------------------------
// nextPowerOfTwo
// ---------------------------------------------------------------------------

test("nextPowerOfTwo: boundary cases", () => {
  assert.equal(nextPowerOfTwo(0), 1);
  assert.equal(nextPowerOfTwo(1), 1);
  assert.equal(nextPowerOfTwo(2), 2);
  assert.equal(nextPowerOfTwo(3), 4);
  assert.equal(nextPowerOfTwo(4), 4);
  assert.equal(nextPowerOfTwo(17), 32); // trace tree
  assert.equal(nextPowerOfTwo(14), 16); // weight tree
});

// ---------------------------------------------------------------------------
// merkleRoot
// ---------------------------------------------------------------------------

test("merkleRoot: single leaf equals the leaf", () => {
  assert.equal(merkleRoot([99n]), 99n);
});

test("merkleRoot: two leaves equals poseidon2(left, right)", () => {
  const [a, b] = [1n, 2n];
  assert.equal(merkleRoot([a, b]), poseidon2(a, b));
});

test("merkleRoot: three leaves pads to 4 with poseidon2 structure", () => {
  const [a, b, c] = [1n, 2n, 3n];
  // Padded tree: [a, b, c, 0n]; parent(a,b) and parent(c,0) then root
  const root = poseidon2(poseidon2(a, b), poseidon2(c, 0n));
  assert.equal(merkleRoot([a, b, c]), root);
});

// ---------------------------------------------------------------------------
// merkleProof round-trips
// ---------------------------------------------------------------------------

test("merkleProof: single leaf has empty proof", () => {
  const proof = merkleProof([99n], 0);
  assert.deepEqual(proof.siblings, []);
  assert.deepEqual(proof.dirs, []);
  assert.ok(verifyMerkleProof(99n, proof, 99n));
});

test("merkleProof: two-leaf round-trips for both leaves", () => {
  const leaves = [10n, 20n];
  const root = merkleRoot(leaves);
  for (let i = 0; i < 2; i++) {
    const proof = merkleProof(leaves, i);
    assert.ok(
      verifyMerkleProof(leaves[i]!, proof, root),
      `leaf ${i} proof should verify`
    );
  }
});

test("merkleProof: round-trip for all leaves in a 4-leaf tree", () => {
  const leaves = [1n, 2n, 3n, 4n];
  const root = merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const proof = merkleProof(leaves, i);
    assert.ok(verifyMerkleProof(leaves[i]!, proof, root), `leaf ${i}`);
  }
});

test("merkleProof: round-trip for all 17 trace leaves (padded to 32)", () => {
  const leaves = Array.from({ length: 17 }, (_, i) => BigInt(i + 100));
  const root = merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const proof = merkleProof(leaves, i);
    assert.ok(verifyMerkleProof(leaves[i]!, proof, root), `trace leaf ${i}`);
  }
});

test("merkleProof: round-trip for all 14 weight leaves (padded to 16)", () => {
  const leaves = Array.from({ length: 14 }, (_, i) => BigInt(i + 200));
  const root = merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const proof = merkleProof(leaves, i);
    assert.ok(verifyMerkleProof(leaves[i]!, proof, root), `weight leaf ${i}`);
  }
});

test("verifyMerkleProof: rejects wrong leaf", () => {
  const leaves = [1n, 2n, 3n, 4n];
  const root = merkleRoot(leaves);
  const proof = merkleProof(leaves, 0);
  assert.ok(!verifyMerkleProof(999n, proof, root), "tampered leaf should fail");
});

test("verifyMerkleProof: rejects wrong root", () => {
  const leaves = [1n, 2n, 3n, 4n];
  const root = merkleRoot(leaves);
  const proof = merkleProof(leaves, 0);
  assert.ok(!verifyMerkleProof(leaves[0]!, proof, root + 1n), "wrong root should fail");
});

test("verifyMerkleProof: rejects swapped sibling", () => {
  const leaves = [1n, 2n, 3n, 4n];
  const root = merkleRoot(leaves);
  const proof = merkleProof(leaves, 0);
  const bad = { siblings: [proof.siblings[0]! + 1n, ...proof.siblings.slice(1)], dirs: proof.dirs };
  assert.ok(!verifyMerkleProof(leaves[0]!, bad, root), "tampered sibling should fail");
});

// ---------------------------------------------------------------------------
// traceLeafIndex — leaf ordering and collision-freedom
// ---------------------------------------------------------------------------

test("traceLeafIndex: layer 0 (input) starts at 0", () => {
  assert.equal(traceLeafIndex(0, 0), 0);
  assert.equal(traceLeafIndex(0, 2), 2); // last input neuron
});

test("traceLeafIndex: layer 1 starts at 3 (= LAYER_SIZES[0])", () => {
  assert.equal(traceLeafIndex(1, 0), 3);
  assert.equal(traceLeafIndex(1, 7), 10); // last layer-1 neuron
});

test("traceLeafIndex: layer 2 starts at 11, layer 3 at 15", () => {
  assert.equal(traceLeafIndex(2, 0), 11);
  assert.equal(traceLeafIndex(2, 3), 14);
  assert.equal(traceLeafIndex(3, 0), 15);
  assert.equal(traceLeafIndex(3, 1), 16);
});

test("traceLeafIndex: all 17 indices are unique and cover [0, 16]", () => {
  const seen = new Set<number>();
  for (let layer = 0; layer < LAYER_SIZES.length; layer++) {
    for (let i = 0; i < LAYER_SIZES[layer]!; i++) {
      const idx = traceLeafIndex(layer, i);
      assert.ok(!seen.has(idx), `collision at (layer=${layer}, i=${i}), idx=${idx}`);
      seen.add(idx);
    }
  }
  assert.equal(seen.size, 17); // 3+8+4+2
  assert.equal(Math.min(...seen), 0);
  assert.equal(Math.max(...seen), 16);
});

// ---------------------------------------------------------------------------
// weightLeafIndex — leaf ordering and collision-freedom
// ---------------------------------------------------------------------------

test("weightLeafIndex: L=1 starts at 0, L=2 at 8, L=3 at 12", () => {
  assert.equal(weightLeafIndex(1, 0), 0);
  assert.equal(weightLeafIndex(1, 7), 7); // last L=1 node
  assert.equal(weightLeafIndex(2, 0), 8);
  assert.equal(weightLeafIndex(2, 3), 11); // last L=2 node
  assert.equal(weightLeafIndex(3, 0), 12);
  assert.equal(weightLeafIndex(3, 1), 13); // last L=3 node
});

test("weightLeafIndex: all 14 indices are unique and cover [0, 13]", () => {
  const seen = new Set<number>();
  for (let L = 1; L <= 3; L++) {
    for (let j = 0; j < LAYER_SIZES[L]!; j++) {
      const idx = weightLeafIndex(L, j);
      assert.ok(!seen.has(idx), `collision at (L=${L}, j=${j}), idx=${idx}`);
      seen.add(idx);
    }
  }
  assert.equal(seen.size, 14); // 8+4+2
  assert.equal(Math.min(...seen), 0);
  assert.equal(Math.max(...seen), 13);
});
