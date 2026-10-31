import test from "node:test";
import assert from "node:assert/strict";
import { groupNestedActivity } from "../src/nested-activity.ts";

test("nested activity grouping preserves transaction order, labels, and first matching account", () => {
  const activity = [
    { nestedUid: "agent-a", nestedEmail: "activity@example.test", id: "one" },
    { nestedUid: "agent-b", id: "two" },
    { nestedUid: "agent-a", id: "three" },
    { nestedUid: "missing", nestedEmail: "missing@example.test", id: "four" },
  ];
  const accounts = [
    { nestedUid: "agent-a", label: "Field Agent", nestedEmail: "agent@example.test" },
    { nestedUid: "agent-a", label: "Duplicate Record", nestedEmail: "duplicate@example.test" },
    { nestedUid: "agent-b", nestedEmail: "" },
  ];

  assert.deepEqual(groupNestedActivity(activity, accounts), [
    { label: "Field Agent", email: "agent@example.test", payments: [activity[0], activity[2]] },
    { label: "Nested Account", email: "", payments: [activity[1]] },
    { label: "missing@example.test", email: "", payments: [activity[3]] },
  ]);
});

test("nested activity grouping handles empty inputs", () => {
  assert.deepEqual(groupNestedActivity([], []), []);
  assert.deepEqual(groupNestedActivity([{ nestedUid: "agent" }], []), [
    { label: "Nested Account", email: "", payments: [{ nestedUid: "agent" }] },
  ]);
});
