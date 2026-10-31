import test from "node:test";
import assert from "node:assert/strict";
import { projectInvestmentPlan, validateInvestmentPlan } from "../src/investment-planning.ts";

const now = Date.UTC(2026, 0, 15);
const plan = (overrides = {}) => ({
  id: "plan-a", name: "Reserve", currentBalance: 100000, monthlyContribution: 10000,
  annualReturnPercent: 0, withdrawalStartDate: Date.UTC(2027, 0, 1), monthlyWithdrawal: 20000,
  minimumBalance: 0, notes: "", status: "active", updatedAt: now, ...overrides,
});

test("projection adds contributions before withdrawal start and models monthly withdrawals", () => {
  const result = projectInvestmentPlan(plan(), now);
  assert.equal(result.availableOnStart, 220000);
  assert.ok(result.withdrawalMonths > 0);
  assert.equal(result.rows[0].contribution, 10000);
  assert.equal(result.isSustainable, false);
  assert.ok(result.firstShortfallDate);
});

test("minimum reserve breach reports first unsupported withdrawal", () => {
  const result = projectInvestmentPlan(plan({ currentBalance: 50000, monthlyContribution: 0, withdrawalStartDate: now, monthlyWithdrawal: 30000, minimumBalance: 25000 }), now);
  assert.equal(new Date(result.firstShortfallDate).getFullYear(), 2026);
  assert.equal(new Date(result.firstShortfallDate).getMonth(), 0);
  assert.equal(result.isSustainable, false);
});

test("paused plans do not model withdrawals", () => {
  const result = projectInvestmentPlan(plan({ status: "paused", withdrawalStartDate: now }), now);
  assert.equal(result.withdrawalMonths, 0);
  assert.equal(result.isSustainable, false);
});

test("plan validation rejects invalid amounts, dates, and assumptions", () => {
  assert.doesNotThrow(() => validateInvestmentPlan(plan()));
  assert.throws(() => validateInvestmentPlan(plan({ monthlyWithdrawal: 0 })));
  assert.throws(() => validateInvestmentPlan(plan({ annualReturnPercent: 101 })));
  assert.throws(() => validateInvestmentPlan(plan({ endDate: now - 1 })));
});
