import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCALE,
  toFixed,
  fromFixed,
  dotBiasShift,
  relu,
  identity,
} from "./fixed-point.js";

test("encode/decode roundtrips at Q47.16 resolution", () => {
  assert.equal(toFixed(1), SCALE);
  assert.equal(toFixed(-2.5), -2n * SCALE - SCALE / 2n);
  assert.equal(fromFixed(toFixed(3.25)), 3.25);
});

test("dotBiasShift matches a hand-computed Q47.16 result", () => {
  // 0.5*2 + (-1)*1 + bias(0.25) = 1 - 1 + 0.25 = 0.25
  const w = [toFixed(0.5), toFixed(-1)];
  const a = [toFixed(2), toFixed(1)];
  const out = dotBiasShift(w, a, toFixed(0.25));
  assert.equal(out, toFixed(0.25));
});

test("relu clamps negatives, identity passes through", () => {
  assert.equal(relu(toFixed(-3)), 0n);
  assert.equal(relu(toFixed(3)), toFixed(3));
  assert.equal(identity(toFixed(-3)), toFixed(-3));
});
