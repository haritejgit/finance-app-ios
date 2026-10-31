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
