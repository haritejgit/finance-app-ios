import test from "node:test";
import assert from "node:assert/strict";
import { withMissingIndexFallback } from "../src/firestore-query-fallback.ts";

test("indexed Firestore query is used when its composite index is ready", async () => {
  const calls = [];
  const result = await withMissingIndexFallback(
    async () => { calls.push("indexed"); return ["latest"]; },
    async () => { calls.push("fallback"); return ["legacy"]; }
  );
  assert.deepEqual(result, ["latest"]);
  assert.deepEqual(calls, ["indexed"]);
});

test("missing-index response uses the compatible query once", async () => {
  const calls = [];
  const result = await withMissingIndexFallback(
    async () => { calls.push("indexed"); throw Object.assign(new Error("index building"), { code: "failed-precondition" }); },
    async () => { calls.push("fallback"); return ["available"]; }
  );
  assert.deepEqual(result, ["available"]);
  assert.deepEqual(calls, ["indexed", "fallback"]);
});

test("unrelated Firestore errors are not hidden by a fallback read", async () => {
  const failure = Object.assign(new Error("permission denied"), { code: "permission-denied" });
  await assert.rejects(
    withMissingIndexFallback(async () => { throw failure; }, async () => []),
    (error) => error === failure
  );
});
