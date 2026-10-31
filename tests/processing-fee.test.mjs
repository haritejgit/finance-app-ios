import test from "node:test";
import assert from "node:assert/strict";
import { calculateProcessingFee, calculateNetDisbursement, getRecordedNetDisbursement } from "../src/processing-fee.ts";

test("processing fee preserves the existing ₹20 per full ₹1,000 rule", () => {
  assert.equal(calculateProcessingFee(5000), 100);
  assert.equal(calculateNetDisbursement(5000), 4900);
  assert.equal(calculateProcessingFee(5999), 100);
});

test("fee can be disabled for new loans and renewals", () => {
  assert.equal(calculateProcessingFee(5000, false), 0);
  assert.equal(calculateNetDisbursement(5000, false), 5000);
});

test("recorded choice and fee are respected without double deduction", () => {
  assert.equal(getRecordedNetDisbursement({ principalAmount: 5000, processingFeeCharged: false, processingFeeAmount: 0 }), 5000);
  assert.equal(getRecordedNetDisbursement({ principalAmount: 5000, processingFeeCharged: true, processingFeeAmount: 75 }), 4925);
});

test("legacy loans without fee metadata retain the historical fee calculation", () => {
  assert.equal(getRecordedNetDisbursement({ principalAmount: 5000 }), 4900);
});

test("invalid and nonpositive principals do not create a fee or disbursement", () => {
  assert.equal(calculateProcessingFee(0), 0);
  assert.equal(calculateProcessingFee(Number.NaN), 0);
  assert.equal(calculateNetDisbursement(-5000), 0);
});
