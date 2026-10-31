import test from "node:test";
import assert from "node:assert/strict";
import { assertFirebaseProjectId } from "../src/firebase-project-guard.ts";

test("Firebase configuration remains pinned to production by default", () => {
  assert.doesNotThrow(() => assertFirebaseProjectId("finance-for-ios"));
  assert.throws(() => assertFirebaseProjectId("staging-finance"), /must be finance-for-ios/);
});

test("staging is accepted only when its expected project is explicitly configured", () => {
  assert.doesNotThrow(() => assertFirebaseProjectId("staging-finance", "staging-finance"));
  assert.throws(() => assertFirebaseProjectId("staging-finance", "another-project"), /must be another-project/);
  assert.throws(() => assertFirebaseProjectId(undefined, "staging-finance"), /received none/);
});
