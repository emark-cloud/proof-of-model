import { test } from "node:test";
import assert from "node:assert/strict";
import { poseidon2 } from "poseidon-lite";
import { POSEIDON_GOLDEN, FIELD_MODULUS, toField } from "./poseidon.js";

// The golden vectors ARE the cross-implementation contract (Rust + Solidity must
// match these too). Here we assert the TS oracle reproduces them.
test("poseidon-lite reproduces golden vectors", () => {
  for (const { inputs, hash } of POSEIDON_GOLDEN) {
    const got = BigInt(poseidon2([inputs[0], inputs[1]]));
    assert.equal(got, hash, `poseidon2(${inputs[0]}, ${inputs[1]})`);
  }
});

test("field reduction wraps into [0, p)", () => {
  assert.equal(toField(FIELD_MODULUS), 0n);
  assert.equal(toField(-1n), FIELD_MODULUS - 1n);
  assert.equal(toField(5n), 5n);
});
