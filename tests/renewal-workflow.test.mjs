import test from "node:test";
import assert from "node:assert/strict";
import { acquireRenewalSubmitLock, assertRenewalRevision, isRenewalContextReady, runWithRenewalSubmitLock, shouldOpenPendingRenewal } from "../src/renewal-workflow.ts";

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

test("an early Renew tap waits for the same customer's profile load", () => {
  assert.equal(shouldOpenPendingRenewal("customer-a", "customer-a", true), false);
  assert.equal(shouldOpenPendingRenewal("customer-a", "customer-b", false), false);
  assert.equal(shouldOpenPendingRenewal("customer-a", "customer-a", false), true);
  assert.equal(shouldOpenPendingRenewal(null, "customer-a", false), false);
});

test("renewal transaction rejects a customer loan revision changed by a competing request", () => {
  assert.doesNotThrow(() => assertRenewalRevision(4, 4));
  assert.doesNotThrow(() => assertRenewalRevision(0, 0));
  assert.throws(() => assertRenewalRevision(4, 5), /Customer loan state changed/);
  assert.throws(() => assertRenewalRevision(-1, -1), /Customer loan state changed/);
});

test("submit lock allows one renewal request and rejects a duplicate click", () => {
  const lock = { current: false };
  assert.equal(acquireRenewalSubmitLock(lock), true);
  assert.equal(acquireRenewalSubmitLock(lock), false);
  lock.current = false;
  assert.equal(acquireRenewalSubmitLock(lock), true);
});

test("submit lock releases after confirmation is cancelled or rejects", async () => {
  const lock = { current: true };
  assert.equal(await runWithRenewalSubmitLock(lock, async () => false), false);
  assert.equal(lock.current, false);

  lock.current = true;
  await assert.rejects(runWithRenewalSubmitLock(lock, async () => { throw new Error("confirmation failed"); }), /confirmation failed/);
  assert.equal(lock.current, false);
});

