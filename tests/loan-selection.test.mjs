import test from "node:test";
import assert from "node:assert/strict";
import { assertSingleActiveLoan, selectLoanForCustomer } from "../src/loan-selection.ts";

test("latest active loan remains the displayed selection without rewriting duplicates", () => {
  const loans = [
    { id: "older", startDate: 100, status: "ACTIVE", balanceAmount: 800 },
    { id: "newer", startDate: 200, status: "ACTIVE", balanceAmount: 1200 },
  ];
  const before = structuredClone(loans);

  assert.equal(selectLoanForCustomer(loans)?.id, "newer");
  assert.deepEqual(loans, before);
  assert.equal(loans[0].balanceAmount, 800);
});

test("historical selection returns the latest loan at the requested date with stored fields intact", () => {
  const loans = [
    { id: "first", startDate: 100, status: "RENEWED", balanceAmount: 0 },
    { id: "second", startDate: 200, status: "ACTIVE", balanceAmount: 500 },
    { id: "future", startDate: 300, status: "ACTIVE", balanceAmount: 900 },
  ];
  const before = structuredClone(loans);

  assert.equal(selectLoanForCustomer(loans, 250)?.id, "second");
  assert.deepEqual(loans, before);
});

test("closed loans choose the most recent record and preserve the original fallback", () => {
  const closed = [
    { id: "old-closed", startDate: 100, status: "CLOSED" },
    { id: "new-closed", startDate: 200, status: "CLOSED" },
  ];
  assert.equal(selectLoanForCustomer(closed)?.id, "new-closed");

  const legacy = [{ id: "legacy", startDate: 100, status: "ARCHIVED" }];
  assert.equal(selectLoanForCustomer(legacy)?.id, "legacy");
  assert.equal(selectLoanForCustomer([]), undefined);
});

test("renewal is blocked when multiple active loans would create an ambiguous settlement", () => {
  assert.doesNotThrow(() => assertSingleActiveLoan([{ status: "ACTIVE" }]));
  assert.doesNotThrow(() => assertSingleActiveLoan([{ status: "ACTIVE" }, { status: "RENEWED" }]));
  assert.throws(
    () => assertSingleActiveLoan([{ status: "ACTIVE" }, { status: "ACTIVE" }]),
    /Review the loan records before renewing/
  );
});

