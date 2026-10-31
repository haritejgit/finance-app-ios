import { test } from "node:test";
import assert from "node:assert/strict";
import { selectFirstActiveLoansByCustomer } from "../functions/src/due-marking.ts";

test("global active-loan scan keeps the same first active loan per customer", () => {
  const orderedLoans = [
    { id: "loan-a", customerId: "customer-1", status: "CLOSED" },
    { id: "loan-b", customerId: "customer-1", status: "ACTIVE" },
    { id: "loan-c", customerId: "customer-1", status: "ACTIVE" },
    { id: "loan-d", customerId: "customer-2", status: "ACTIVE" },
    { id: "loan-e", customerId: "", status: "ACTIVE" },
  ];

  const selected = selectFirstActiveLoansByCustomer(orderedLoans);
  assert.equal(selected.get("customer-1")?.id, "loan-b");
  assert.equal(selected.get("customer-2")?.id, "loan-d");
  assert.equal(selected.has(""), false);
});

test("global active-loan scan ignores any unexpectedly returned non-active documents", () => {
  const selected = selectFirstActiveLoansByCustomer([
    { id: "loan-a", customerId: "customer-1", status: "RENEWED" },
    { id: "loan-b", customerId: "customer-1", status: "ACTIVE" },
  ]);
  assert.equal(selected.get("customer-1")?.id, "loan-b");
});

test("grouped query selection matches the previous per-customer find semantics", () => {
  const customers = ["customer-a", "customer-b", "customer-c"];
  const loansInDocumentIdOrder = [
    { id: "a-closed", customerId: "customer-a", status: "CLOSED" },
    { id: "b-active", customerId: "customer-a", status: "ACTIVE" },
    { id: "c-active", customerId: "customer-a", status: "ACTIVE" },
    { id: "d-active", customerId: "customer-b", status: "ACTIVE" },
    { id: "e-renewed", customerId: "customer-b", status: "RENEWED" },
  ];
  const legacySelection = new Map(customers.map((customerId) => [
    customerId,
    loansInDocumentIdOrder.find((loan) => loan.customerId === customerId && loan.status === "ACTIVE")?.id ?? null,
  ]));
  const optimizedSelection = selectFirstActiveLoansByCustomer(loansInDocumentIdOrder);

  for (const customerId of customers) {
    assert.equal(optimizedSelection.get(customerId)?.id ?? null, legacySelection.get(customerId));
  }
});
