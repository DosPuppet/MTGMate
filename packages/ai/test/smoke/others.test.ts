/**
 * Smoke test: handled cards of the sets without their own file (`OWN_FILES`). Since The Hobbit, every set has its
 * own; this file picks up a set added without one.
 */
import { expect, it } from "vitest";
import { OTHER_SETS, smokeTest } from "./harness";

smokeTest(OTHER_SETS());

it("sets without their own smoke file are tested here", () => {
  expect(Array.isArray(OTHER_SETS())).toBe(true);
});
