import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POSEIDON_GOLDEN,
  FIELD_MODULUS,
  toField,
  poseidon2,
  feltFromFixed,
} from "./poseidon.js";
import { SCALE, toFixed } from "./fixed-point.js";

// The golden vectors ARE the cross-implementation contract (Rust + Solidity must
// match these too). Here we assert our poseidon2 re-export reproduces them.
test("poseidon2 reproduces golden vectors", () => {
  for (const { inputs, hash } of POSEIDON_GOLDEN) {
    const got = poseidon2(inputs[0], inputs[1]);
    assert.equal(got, hash, `poseidon2(${inputs[0]}, ${inputs[1]})`);
  }
});

test("field reduction wraps into [0, p)", () => {
  assert.equal(toField(FIELD_MODULUS), 0n);
  assert.equal(toField(-1n), FIELD_MODULUS - 1n);
  assert.equal(toField(5n), 5n);
});

test("feltFromFixed: non-negative values pass through unchanged", () => {
  assert.equal(feltFromFixed(0n), 0n);
  assert.equal(feltFromFixed(1n), 1n);
  assert.equal(feltFromFixed(SCALE), SCALE); // toFixed(1) = SCALE
  assert.equal(feltFromFixed(toFixed(3.25)), toFixed(3.25));
});

test("feltFromFixed: negative values fold into the field", () => {
  // x = -1n → FIELD_MODULUS - 1n
  assert.equal(feltFromFixed(-1n), FIELD_MODULUS - 1n);
  // x = -SCALE = toFixed(-1) → FIELD_MODULUS - SCALE
  assert.equal(feltFromFixed(-SCALE), FIELD_MODULUS - SCALE);
  // x = toFixed(-2.5) → FIELD_MODULUS + toFixed(-2.5)  (which is negative)
  const neg2_5 = toFixed(-2.5);
  assert.ok(neg2_5 < 0n);
  assert.equal(feltFromFixed(neg2_5), FIELD_MODULUS + neg2_5);
});

test("feltFromFixed: result is always in [0, FIELD_MODULUS)", () => {
  const samples = [0n, 1n, SCALE, -1n, -SCALE, toFixed(100), toFixed(-100)];
  for (const x of samples) {
    const f = feltFromFixed(x);
    assert.ok(f >= 0n && f < FIELD_MODULUS, `feltFromFixed(${x}) = ${f} out of field`);
  }
});
