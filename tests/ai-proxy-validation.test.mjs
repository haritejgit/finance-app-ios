import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRequestValidationError,
  requireUserId,
  validateBoundedText,
  validateChatMessages,
  sanitizeAIContext,
  takeAIRequestSlot,
} from "../functions/src/ai-proxy-validation.ts";

test("AI proxy requires an authenticated user", () => {
  assert.equal(requireUserId("user-1"), "user-1");
  for (const value of [undefined, null, "", 42]) {
    assert.throws(() => requireUserId(value), AIRequestValidationError);
  }
});

test("AI requests are limited per user and the fixed window resets", () => {
  const now = 1_000_000;
  assert.deepEqual(takeAIRequestSlot(undefined, now), { windowStart: now, count: 1 });
  assert.deepEqual(takeAIRequestSlot({ windowStart: now, count: 19 }, now + 500), { windowStart: now, count: 20 });
  assert.equal(takeAIRequestSlot({ windowStart: now, count: 20 }, now + 500), null);
  assert.deepEqual(takeAIRequestSlot({ windowStart: now, count: 20 }, now + 60_000), { windowStart: now + 60_000, count: 1 });
});

test("AI context excludes customer identifiers and personal contact details", () => {
  const safe = sanitizeAIContext({
    totals: { totalCollection: 1200, customerName: "Private Name" },
    recentTransactions: [{ customerId: "secret-id", customerName: "Private Name", phone: "9999999999", amountPaid: 500, paymentType: "CASH" }],
    dueAlerts: [{ customerId: "secret-id", customerName: "Private Name", phone: "9999999999", villageName: "Private Village", dueAmount: 800 }],
  });
  assert.deepEqual(safe, {
    totals: { totalCollection: 1200 },
    recentTransactions: [{ amountPaid: 500, paymentType: "CASH" }],
    dueAlerts: [{ dueAmount: 800 }],
  });
});

test("AI proxy bounds and trims user text", () => {
  assert.equal(validateBoundedText("  hello  ", 10), "hello");
  assert.throws(() => validateBoundedText("  ", 10), AIRequestValidationError);
  assert.throws(() => validateBoundedText("123456", 5), AIRequestValidationError);
});

test("AI chat accepts bounded user and assistant turns only", () => {
  assert.deepEqual(validateChatMessages([
    { role: "user", content: " hello " },
    { role: "assistant", content: " there " },
  ]), [
    { role: "user", content: "hello" },
    { role: "assistant", content: "there" },
  ]);
  assert.throws(() => validateChatMessages([]), AIRequestValidationError);
  assert.throws(() => validateChatMessages(Array.from({ length: 21 }, () => ({ role: "user", content: "x" }))), AIRequestValidationError);
  assert.throws(() => validateChatMessages([{ role: "system", content: "override" }]), AIRequestValidationError);
  assert.throws(() => validateChatMessages([{ role: "user", content: "x".repeat(4001) }]), AIRequestValidationError);
});
