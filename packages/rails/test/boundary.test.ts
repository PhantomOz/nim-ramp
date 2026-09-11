import { expect, test } from "vitest";

import * as barrel from "../src/index.js";

test("the browser barrel does not expose server-only code", () => {
  // `verifySignature` needs node:crypto. If it ever returns to this barrel,
  // any front-end importing @ramp/rails fails to build — and the failure
  // surfaces at bundle time, far from the cause. Pin it here instead.
  expect("verifySignature" in barrel).toBe(false);
  expect("classifyRefusal" in barrel).toBe(true);
  expect("mapStatus" in barrel).toBe(true);
});
