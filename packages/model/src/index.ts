/**
 * @proof/model — deterministic fixed-point reference net (3→8→4→2).
 *
 * The model is the CONTRACT for everything downstream: its golden fixtures
 * (buildGoodFixture / buildBadFixture) are what the Stylus verifier, contracts,
 * and agents assert against. Change nothing here without regenerating fixtures.json
 * and updating the Rust tests.
 */
export { WEIGHTS, BIASES, rowLeaf, weightRoot } from "./weights.js";
export { forward, type InferenceResult } from "./forward.js";
export { commit } from "./commit.js";
export {
  samplePath,
  openPath,
  encodePathProof,
  decodePathProof,
  type PathSpec,
  type PathNodeProof,
  type PathProof,
} from "./path.js";
export {
  FIXTURE_INPUT,
  FIXTURE_PATH_SPEC,
  BAD_FIXTURE_PATH_SPEC,
  CORRUPT_NODE,
  buildGoodFixture,
  buildBadFixture,
  generateFixturesJSON,
  type Fixture,
} from "./fixtures.js";

import { LAYER_SIZES, ACTIVATIONS } from "@proof/shared";
export const SHAPE = { LAYER_SIZES, ACTIVATIONS } as const;
