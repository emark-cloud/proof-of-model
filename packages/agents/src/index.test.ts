import { test } from "node:test";
import assert from "node:assert/strict";
import { createProvider, createBuyer, createChallenger } from "./index.js";

// Scaffold smoke test: the three actors are wired and throw until Phase 2.
test("agents are scaffolded (throw until Phase 2)", () => {
  assert.throws(() => createProvider({ cheat: false }));
  assert.throws(() => createBuyer());
  assert.throws(() => createChallenger());
});
