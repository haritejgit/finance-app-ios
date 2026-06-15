"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyAutoMarkDues = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
function toMillis(value) {
    if (typeof value === "number")
        return value;
    if (value instanceof Date)
        return value.getTime();
    if (typeof value?.toMillis === "function")
        return value.toMillis();
    if (typeof value?.seconds === "number")
        return value.seconds * 1000;
    if (value && typeof value._seconds === "number")
        return value._seconds * 1000;
    if (typeof value?.toDate === "function")
        return value.toDate().getTime();
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
}
function getPersonalCycleStartTs(dateMs, cycleStartDay) {
    const d = new Date(toMillis(dateMs));
    d.setHours(0, 0, 0, 0);
    const currentDay = d.getDay(); // 0 (Sun) - 6 (Sat)
    let diff = currentDay - cycleStartDay;
    if (diff < 0)
        diff += 7;
    d.setDate(d.getDate() - diff);
    return d.getTime();
}
function getOrDeriveCycleStartDay(customer, loanStartDate) {
    if (customer && typeof customer.cycleStartDay === "number" && customer.cycleStartDay >= 0 && customer.cycleStartDay <= 6) {
        return customer.cycleStartDay;
    }
    const baseDate = loanStartDate || customer?.createdAt || Date.now();
    return new Date(toMillis(baseDate)).getDay();
}
exports.dailyAutoMarkDues = functions.pubsub
    .schedule("every 24 hours")
    .onRun(async (context) => {
    const now = Date.now();
    console.log(`Running dailyAutoMarkDues at: ${new Date(now).toISOString()}`);
    try {
        // 1. Get all customers and filter active ones in memory (to handle undefined isActive correctly)
        const customersSnap = await db.collection("customers").get();
        const activeCustomers = customersSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(c => c.isActive !== false);
        console.log(`Found ${activeCustomers.length} active customers.`);
        for (const customer of activeCustomers) {
            // 2. Fetch all loans for this customer and filter for active in memory to avoid index requirements
            const loansSnap = await db.collection("loans")
                .where("customerId", "==", customer.id)
                .get();
            const activeLoan = loansSnap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .find(l => l.status === "ACTIVE");
            if (!activeLoan) {
                continue;
            }
            const loanStartDateMs = toMillis(activeLoan.startDate);
            const cycleStartDay = getOrDeriveCycleStartDay(customer, loanStartDateMs);
            // Find all completed personal cycle weeks since loan start
            const currentCycleStartTs = getPersonalCycleStartTs(now, cycleStartDay);
            const loanCycleStartTs = getPersonalCycleStartTs(loanStartDateMs + 7 * 24 * 60 * 60 * 1000, cycleStartDay);
            const diffMs = currentCycleStartTs - loanCycleStartTs;
            const totalWeeksElapsed = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
            if (totalWeeksElapsed <= 0) {
                continue;
            }
            // 3. Fetch all payments and dues for this customer/loan
            const paymentsSnap = await db.collection("payments")
                .where("customerId", "==", customer.id)
                .get();
            const loanPayments = paymentsSnap.docs
                .map(doc => doc.data())
                .filter(p => p.loanId === activeLoan.id);
            // Group payments by their personal cycle week start timestamp
            const paidCycleStarts = new Set();
            const existingDueCycleStarts = new Set();
            for (const p of loanPayments) {
                const pTs = toMillis(p.paymentDate);
                const pCycleStart = getPersonalCycleStartTs(pTs, cycleStartDay);
                const pType = p.paymentType || p.type;
                if (pType === "DUE") {
                    existingDueCycleStarts.add(pCycleStart);
                }
                else if (pType === "REGULAR" ||
                    pType === "CASH" ||
                    pType === "PHONE") {
                    paidCycleStarts.add(pCycleStart);
                }
            }
            // For each elapsed week, see if a regular payment exists. If not, make sure a DUE exists.
            for (let w = 0; w < totalWeeksElapsed; w++) {
                const weekStartTs = loanCycleStartTs + w * 7 * 24 * 60 * 60 * 1000;
                // If paid, skip
                if (paidCycleStarts.has(weekStartTs)) {
                    continue;
                }
                // If not paid and no DUE entry exists, create one
                if (!existingDueCycleStarts.has(weekStartTs)) {
                    const dueId = `due_${activeLoan.id}_w${w + 1}`;
                    const duePayment = {
                        id: dueId,
                        loanId: activeLoan.id,
                        customerId: activeLoan.customerId,
                        amountPaid: 0,
                        paymentDate: weekStartTs, // Start of that cycle week
                        weekNumber: w + 1,
                        paymentType: "DUE",
                        paymentMode: "CASH",
                        type: "DUE",
                        userId: activeLoan.userId,
                        isAutoDue: true, // Mark it as an auto-due
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    };
                    await db.collection("payments").doc(dueId).set(duePayment);
                    console.log(`Created auto-due for customer ${customer.id}, loan ${activeLoan.id}, week ${w + 1}`);
                }
            }
        }
    }
    catch (error) {
        console.error("Error in dailyAutoMarkDues:", error);
    }
    return null;
});
//# sourceMappingURL=index.js.map