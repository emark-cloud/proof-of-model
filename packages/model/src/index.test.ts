import { test } from "node:test";
import assert from "node:assert/strict";
import { SHAPE } from "./index.js";

test("model exposes the locked 3→8→4→2 shape", () => {
  assert.deepEqual([...SHAPE.LAYER_SIZES], [3, 8, 4, 2]);
  assert.equal(SHAPE.ACTIVATIONS.at(-1), "identity");
});
