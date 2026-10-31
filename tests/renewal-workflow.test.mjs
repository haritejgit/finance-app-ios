import test from "node:test";
import assert from "node:assert/strict";
import { acquireRenewalSubmitLock, isRenewalContextReady } from "../src/renewal-workflow.ts";

const ready = { loading: false, hasError: false, customerId: "customer-a", customer: { id: "customer-a" }, loan: { customerId: "customer-a", status: "ACTIVE" } };

test("renewal waits until the selected customer's loan is loaded", () => {
  assert.equal(isRenewalContextReady({ ...ready, loading: true }), false);
  assert.equal(isRenewalContextReady({ ...ready, loan: null }), false);
  assert.equal(isRenewalContextReady({ ...ready, hasError: true }), false);
});

test("renewal never opens against a stale or already renewed customer loan", () => {
  assert.equal(isRenewalContextReady({ ...ready, customer: { id: "customer-b" } }), false);
  assert.equal(isRenewalContextReady({ ...ready, loan: { customerId: "customer-b", status: "ACTIVE" } }), false);
  assert.equal(isRenewalContextReady({ ...ready, loan: { customerId: "customer-a", status: "RENEWED" } }), false);
  assert.equal(isRenewalContextReady(ready), true);
});

test("submit lock allows one renewal request and rejects a duplicate click", () => {
  const lock = { current: false };
  assert.equal(acquireRenewalSubmitLock(lock), true);
  assert.equal(acquireRenewalSubmitLock(lock), false);
  lock.current = false;
  assert.equal(acquireRenewalSubmitLock(lock), true);
});
