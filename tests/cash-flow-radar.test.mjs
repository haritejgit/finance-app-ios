import test from "node:test";
import assert from "node:assert/strict";
import { estimateExpectedCollections, projectRadarBalance } from "../src/cash-flow-radar.ts";

test("expected collection forecast discounts scheduled installments by recent payment rate", () => {
  assert.equal(estimateExpectedCollections(7000, 100000, 80, 7), 5600);
  assert.equal(estimateExpectedCollections(7000, 100000, 80, 30), 24000);
});

test("expected receipts are capped at receivables and zero when reliability is zero", () => {
  assert.equal(estimateExpectedCollections(7000, 1000, 100, 90), 1000);
  assert.equal(estimateExpectedCollections(7000, 100000, 0, 30), 0);
});

test("cash radar reports a shortfall without adding receivables to available cash", () => {
  const result = projectRadarBalance(5000, 1000, 2500, 4000);
  assert.equal(result.projectedCash, 3500);
  assert.equal(result.belowMinimum, true);
  assert.equal(result.shortfallAmount, 500);
});
