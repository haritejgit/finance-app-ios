import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-finance-rules";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let testEnv;

const validPlan = (id = "plan-a") => ({
  id, name: "Reserve", currentBalance: 100000, monthlyContribution: 10000,
  annualReturnPercent: 0, withdrawalStartDate: Date.UTC(2027, 0, 1),
  monthlyWithdrawal: 20000, minimumBalance: 10000, notes: "Plan notes",
  status: "active", updatedAt: Date.now(),
});

before(async () => {
  const rules = await readFile(resolve(root, "firestore.rules"), "utf8");
  testEnv = await initializeTestEnvironment({ projectId, firestore: { rules } });
});

after(async () => { await testEnv?.cleanup(); });

test("owner can create, read, update, and delete a valid investment plan", async () => {
  const db = testEnv.authenticatedContext("owner-a").firestore();
  const ref = doc(db, "users", "owner-a", "investmentPlans", "plan-a");
  await assertSucceeds(setDoc(ref, validPlan()));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { monthlyWithdrawal: 25000, updatedAt: Date.now() }));
  await assertSucceeds(deleteDoc(ref));
});

test("another owner and unauthenticated users cannot read or write a plan", async () => {
  const ownerDb = testEnv.authenticatedContext("owner-a").firestore();
  const otherDb = testEnv.authenticatedContext("owner-b").firestore();
  const ref = doc(ownerDb, "users", "owner-a", "investmentPlans", "plan-a");
  await testEnv.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "users", "owner-a", "investmentPlans", "plan-a"), validPlan()));
  await assertFails(getDoc(doc(otherDb, "users", "owner-a", "investmentPlans", "plan-a")));
  await assertFails(setDoc(doc(otherDb, "users", "owner-a", "investmentPlans", "plan-b"), validPlan("plan-b")));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "users", "owner-a", "investmentPlans", "plan-a")));
  await assertSucceeds(getDoc(ref));
});

test("nested collectors may read the existing owner profile but cannot read owner-only financial plans", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "users", "owner-a"), { id: "owner-a", userId: "owner-a", role: "owner" });
    await setDoc(doc(adminDb, "users", "collector-a"), { id: "collector-a", userId: "collector-a", role: "nested", parentUid: "owner-a", active: true });
    await setDoc(doc(adminDb, "users", "owner-a", "investmentPlans", "plan-a"), validPlan());
  });
  const db = testEnv.authenticatedContext("collector-a").firestore();
  await assertSucceeds(getDoc(doc(db, "users", "owner-a")));
  await assertFails(getDoc(doc(db, "users", "owner-a", "investmentPlans", "plan-a")));
  await assertFails(setDoc(doc(db, "users", "owner-a", "privateFinance", "settings"), { minimumCashReserve: 50000, updatedAt: Date.now() }));
});

test("nested profile updates cannot change role, owner, or disabled status to gain access", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "users", "owner-a"), { id: "owner-a", userId: "owner-a", role: "owner" });
    await setDoc(doc(adminDb, "users", "owner-b"), { id: "owner-b", userId: "owner-b", role: "owner" });
    await setDoc(doc(adminDb, "users", "collector-a"), { id: "collector-a", userId: "collector-a", role: "nested", parentUid: "owner-a", active: true });
    await setDoc(doc(adminDb, "customers", "private-customer"), { userId: "owner-b", name: "Private customer" });
  });

  const collectorDb = testEnv.authenticatedContext("collector-a").firestore();
  const collectorProfile = doc(collectorDb, "users", "collector-a");
  await assertFails(updateDoc(collectorProfile, { role: "owner" }));
  await assertFails(updateDoc(collectorProfile, { parentUid: "owner-b" }));
  await assertFails(deleteDoc(collectorProfile));
  await assertSucceeds(updateDoc(collectorProfile, { active: true }));
  await assertFails(getDoc(doc(collectorDb, "customers", "private-customer")));

  const ownerDb = testEnv.authenticatedContext("owner-a").firestore();
  await assertSucceeds(updateDoc(doc(ownerDb, "users", "collector-a"), { active: false }));
  await assertFails(updateDoc(doc(collectorDb, "users", "collector-a"), { active: true }));
  await assertFails(updateDoc(doc(ownerDb, "users", "collector-a"), { parentUid: "owner-b" }));
  await assertSucceeds(deleteDoc(doc(ownerDb, "users", "collector-a")));
});

test("self-created profiles cannot claim another owner, while legacy nested profile healing stays valid", async () => {
  const ownerDb = testEnv.authenticatedContext("owner-c").firestore();
  const strangerDb = testEnv.authenticatedContext("stranger-c").firestore();
  const ownerProfile = { id: "owner-c", userId: "owner-c", role: "owner", createdAt: Date.now() };
  await assertSucceeds(setDoc(doc(ownerDb, "users", "owner-c"), ownerProfile));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "users", "owner-d"), { id: "owner-d", userId: "owner-d", role: "owner" });
    await setDoc(doc(adminDb, "customers", "owner-d-customer"), { userId: "owner-d", name: "Private customer" });
    await setDoc(doc(adminDb, "nestedAccounts", "legacy-collector"), { id: "legacy-collector", ownerUid: "owner-d", masterUserId: "owner-d", active: true });
  });

  await assertFails(setDoc(doc(strangerDb, "users", "stranger-c"), { id: "stranger-c", userId: "stranger-c", role: "nested", parentUid: "owner-d", createdAt: Date.now() }));
  await assertFails(getDoc(doc(strangerDb, "customers", "owner-d-customer")));

  const legacyDb = testEnv.authenticatedContext("legacy-collector").firestore();
  await assertSucceeds(setDoc(doc(legacyDb, "users", "legacy-collector"), { id: "legacy-collector", userId: "legacy-collector", role: "nested", parentUid: "owner-d", active: true, createdAt: Date.now() }));
  await assertSucceeds(getDoc(doc(legacyDb, "customers", "owner-d-customer")));
});

test("nested accounts cannot rewrite trusted owner links or create their own access grant", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "users", "owner-e"), { id: "owner-e", userId: "owner-e", role: "owner" });
    await setDoc(doc(adminDb, "users", "owner-f"), { id: "owner-f", userId: "owner-f", role: "owner" });
    await setDoc(doc(adminDb, "nestedAccounts", "collector-e"), { id: "collector-e", nestedUid: "collector-e", ownerUid: "owner-e", masterUserId: "owner-e", active: true });
    await setDoc(doc(adminDb, "customers", "owner-f-customer"), { userId: "owner-f", name: "Private customer" });
  });

  const collectorDb = testEnv.authenticatedContext("collector-e").firestore();
  const accountRef = doc(collectorDb, "nestedAccounts", "collector-e");
  await assertFails(updateDoc(accountRef, { masterUserId: "owner-f" }));
  await assertFails(updateDoc(accountRef, { ownerUid: "owner-f" }));
  await assertFails(getDoc(doc(collectorDb, "customers", "owner-f-customer")));
  await assertFails(setDoc(accountRef, { id: "collector-e", nestedUid: "collector-e", ownerUid: "collector-e", masterUserId: "owner-f", active: true }));

  const ownerDb = testEnv.authenticatedContext("owner-e").firestore();
  await assertSucceeds(setDoc(doc(ownerDb, "nestedAccounts", "collector-new"), { id: "collector-new", nestedUid: "collector-new", ownerUid: "owner-e", masterUserId: "owner-e", active: true }));
  const ownerAccountRef = doc(ownerDb, "nestedAccounts", "collector-e");
  await assertSucceeds(updateDoc(ownerAccountRef, { active: false }));
  await assertSucceeds(deleteDoc(ownerAccountRef));
  await assertFails(setDoc(doc(ownerDb, "nestedAccounts", "owner-e"), { id: "owner-e", nestedUid: "owner-e", ownerUid: "owner-e", masterUserId: "owner-e", active: true }));
});

test("nested financial entries stay within the linked owner and preserve immutable ownership", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "users", "owner-g"), { id: "owner-g", userId: "owner-g", role: "owner" });
    await setDoc(doc(adminDb, "users", "owner-h"), { id: "owner-h", userId: "owner-h", role: "owner" });
    await setDoc(doc(adminDb, "users", "collector-g"), { id: "collector-g", userId: "collector-g", role: "nested", parentUid: "owner-g", active: true });
  });

  const collectorDb = testEnv.authenticatedContext("collector-g").firestore();
  const entry = { ownerUid: "owner-g", nestedUid: "collector-g", nestedEmail: "agent@example.test", customerId: "cust-1", customerName: "Customer", amount: 0, type: "DUE", date: Date.now(), notes: "Marked due", exported: false, createdAt: Date.now() };
  const txnRef = doc(collectorDb, "nestedTransactions", "txn-g");
  await assertSucceeds(setDoc(txnRef, entry));
  await assertSucceeds(updateDoc(txnRef, { amount: 500, notes: "Adjusted before sync" }));
  await assertFails(updateDoc(txnRef, { ownerUid: "owner-h" }));
  await assertFails(updateDoc(txnRef, { exported: true }));
  await assertFails(setDoc(doc(collectorDb, "nestedTransactions", "txn-forged"), { ...entry, ownerUid: "owner-h" }));

  const expenseRef = doc(collectorDb, "nestedExpenses", "nexp-collector-g-1");
  await assertSucceeds(setDoc(expenseRef, { id: "nexp-collector-g-1", ownerUid: "owner-g", nestedUid: "collector-g", amount: 75, note: "Travel", date: Date.now(), createdAt: Date.now() }));
  await assertSucceeds(updateDoc(expenseRef, { amount: 80, note: "Updated travel" }));
  await assertFails(updateDoc(expenseRef, { ownerUid: "owner-h" }));
  await assertFails(setDoc(doc(collectorDb, "nestedExpenses", "nexp-forged"), { ownerUid: "owner-h", nestedUid: "collector-g", amount: 75, note: "Forged", date: Date.now() }));

  const ownerDb = testEnv.authenticatedContext("owner-g").firestore();
  await assertSucceeds(updateDoc(doc(ownerDb, "nestedTransactions", "txn-g"), { exported: true }));
  await assertSucceeds(updateDoc(doc(ownerDb, "nestedTransactions", "txn-g"), { amount: 600 }));
  await assertFails(updateDoc(doc(collectorDb, "nestedTransactions", "txn-g"), { amount: 700 }));
});

test("temporary nested customers require a bounded, valid import record for the linked owner", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "users", "owner-i"), { id: "owner-i", userId: "owner-i", role: "owner" });
    await setDoc(doc(adminDb, "users", "owner-j"), { id: "owner-j", userId: "owner-j", role: "owner" });
    await setDoc(doc(adminDb, "users", "collector-i"), { id: "collector-i", userId: "collector-i", role: "nested", parentUid: "owner-i", active: true });
  });

  const collectorDb = testEnv.authenticatedContext("collector-i").firestore();
  const nestedCustomer = {
    id: "temp_cust_1", numericalId: 12, name: "Temporary customer", phone: "9876543210", alternativePhone: "",
    aadhar: "123456789012", coName: "", coId: null, locationDesc: "", latitude: null, longitude: null,
    villageId: "village-i", masterUserId: "owner-i", nestedUserId: "collector-i", createdAt: Date.now(),
    isActive: true, isTemp: true, principal: 5000, processingFeeCharged: true, processingFeeAmount: 100,
    disbursementMode: "CASH",
  };
  await assertSucceeds(setDoc(doc(collectorDb, "nestedCustomers", nestedCustomer.id), nestedCustomer));
  await assertSucceeds(getDoc(doc(testEnv.authenticatedContext("owner-i").firestore(), "nestedCustomers", nestedCustomer.id)));
  await assertFails(setDoc(doc(collectorDb, "nestedCustomers", "temp_cust_wrong-owner"), { ...nestedCustomer, id: "temp_cust_wrong-owner", masterUserId: "owner-j" }));
  await assertFails(setDoc(doc(collectorDb, "nestedCustomers", "temp_cust_negative"), { ...nestedCustomer, id: "temp_cust_negative", principal: -5000 }));
  await assertFails(setDoc(doc(collectorDb, "nestedCustomers", "temp_cust_bad-fee"), { ...nestedCustomer, id: "temp_cust_bad-fee", processingFeeAmount: 6000 }));
  await assertFails(setDoc(doc(collectorDb, "nestedCustomers", "temp_cust_bad-coord"), { ...nestedCustomer, id: "temp_cust_bad-coord", latitude: 91 }));
  await assertFails(setDoc(doc(collectorDb, "nestedCustomers", "temp_cust-extra"), { ...nestedCustomer, id: "temp_cust-extra", ownerUid: "owner-i" }));
});

test("rules reject invalid plan IDs, amounts, returns, and extra fields", async () => {
  const db = testEnv.authenticatedContext("owner-a").firestore();
  const base = validPlan();
  await assertFails(setDoc(doc(db, "users", "owner-a", "investmentPlans", "different-id"), base));
  await assertFails(setDoc(doc(db, "users", "owner-a", "investmentPlans", "bad-withdrawal"), { ...validPlan("bad-withdrawal"), monthlyWithdrawal: -1 }));
  await assertFails(setDoc(doc(db, "users", "owner-a", "investmentPlans", "bad-return"), { ...validPlan("bad-return"), annualReturnPercent: 101 }));
  await assertFails(setDoc(doc(db, "users", "owner-a", "investmentPlans", "extra-field"), { ...validPlan("extra-field"), userId: "other" }));
});

test("cash-flow reserve settings stay owner-only and reject negative balances", async () => {
  const ownerDb = testEnv.authenticatedContext("owner-a").firestore();
  const otherDb = testEnv.authenticatedContext("owner-b").firestore();
  const ownerRef = doc(ownerDb, "users", "owner-a", "privateFinance", "settings");
  await assertSucceeds(setDoc(ownerRef, { minimumCashReserve: 50000, updatedAt: Date.now() }));
  await assertSucceeds(getDoc(ownerRef));
  await assertFails(updateDoc(ownerRef, { minimumCashReserve: -1 }));
  await assertFails(getDoc(doc(otherDb, "users", "owner-a", "privateFinance", "settings")));
  await assertFails(getDoc(doc(ownerDb, "users", "owner-a", "privateFinance", "other")));
});

test("custom loan recommendations persist on the correct customer and reject invalid amounts", async () => {
  const ownerDb = testEnv.authenticatedContext("owner-a").firestore();
  const otherDb = testEnv.authenticatedContext("owner-b").firestore();
  const customerRef = doc(ownerDb, "customers", "recommendation-customer");
  await assertSucceeds(setDoc(customerRef, {
    id: "recommendation-customer", userId: "owner-a", name: "Recommendation customer",
    customRecommendedLoanAmount: 12000, renewalRevision: 0,
  }));
  await assertSucceeds(updateDoc(customerRef, { customRecommendedLoanAmount: 18000, renewalRevision: 1 }));
  assert.equal((await getDoc(customerRef)).data()?.customRecommendedLoanAmount, 18000);

  for (const invalidAmount of [0, -1, 18000.5, 50000001, "18000"]) {
    await assertFails(updateDoc(customerRef, { customRecommendedLoanAmount: invalidAmount }));
  }
  for (const invalidRevision of [-1, 1.5, "2"]) {
    await assertFails(updateDoc(customerRef, { renewalRevision: invalidRevision }));
  }
  await assertFails(getDoc(doc(otherDb, "customers", "recommendation-customer")));

  const legacyRef = doc(ownerDb, "customers", "legacy-recommendation-customer");
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "customers", "legacy-recommendation-customer"), {
      id: "legacy-recommendation-customer", userId: "owner-a", name: "Legacy recommendation",
      phone: "9876543210", customRecommendedLoanAmount: 18000.5,
    });
  });
  await assertSucceeds(updateDoc(legacyRef, { phone: "9876543211" }));
  await assertFails(updateDoc(legacyRef, { customRecommendedLoanAmount: 18000.75 }));
});

test("debug logs accept only small, sanitized records owned by the signed-in user", async () => {
  const ownerDb = testEnv.authenticatedContext("owner-a").firestore();
  const otherDb = testEnv.authenticatedContext("owner-b").firestore();
  const validLog = { timestamp: Date.now(), userUid: "owner-a", message: "profile reload failed" };
  await assertSucceeds(setDoc(doc(ownerDb, "debugLogs", "owner-log"), validLog));
  await assertFails(getDoc(doc(ownerDb, "debugLogs", "owner-log")));
  await assertFails(setDoc(doc(otherDb, "debugLogs", "spoofed-log"), validLog));
  await assertFails(setDoc(doc(ownerDb, "debugLogs", "sensitive-log"), { ...validLog, error: "private details" }));
  await assertFails(setDoc(doc(ownerDb, "debugLogs", "long-log"), { ...validLog, message: "x".repeat(121) }));
});

test("server-only AI usage counters cannot be read or modified by clients", async () => {
  const ownerDb = testEnv.authenticatedContext("owner-a").firestore();
  const collectorDb = testEnv.authenticatedContext("collector-a").firestore();
  const ownerCounter = doc(ownerDb, "_aiUsage", "owner-a");
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "_aiUsage", "owner-a"), { windowStart: Date.now(), count: 1 });
  });
  await assertFails(getDoc(ownerCounter));
  await assertFails(updateDoc(ownerCounter, { count: 0 }));
  await assertFails(deleteDoc(ownerCounter));
  await assertFails(setDoc(doc(ownerDb, "_aiUsage", "forged-user"), { windowStart: Date.now(), count: 1 }));
  await assertFails(getDoc(doc(collectorDb, "_aiUsage", "owner-a")));
  await assertFails(setDoc(doc(collectorDb, "_aiUsage", "collector-a"), { windowStart: Date.now(), count: 1 }));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "_aiUsage", "owner-a")));
});
