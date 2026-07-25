const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "service-account-key.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  admin.initializeApp();
}

const db = admin.firestore();

// Helper to convert Firebase Timestamp/Date/String to Milliseconds
function toMillis(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  if (val.toMillis) return val.toMillis();
  if (val.toDate) return val.toDate().getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val === "string") return new Date(val).getTime();
  if (val._seconds) return val._seconds * 1000 + (val._nanoseconds || 0) / 1000000;
  return 0;
}

function money(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function getLoanPrincipalAmount(loan) {
  return money(loan.principalAmount ?? loan.principal_amount ?? loan.loanAmount ?? loan.amount);
}

function calculateDisbursedAmount(loanAmount) {
  const principal = money(loanAmount);
  return Math.max(0, principal - Math.floor(principal / 1000) * 20);
}

function getLoanDistributedAmount(loan) {
  return calculateDisbursedAmount(getLoanPrincipalAmount(loan));
}

function isRealCollectionPayment(payment) {
  const kind = payment.paymentType ?? payment.type ?? "REGULAR";
  if (kind === "DUE") {
    return Number(payment.amountPaid || 0) > 0;
  }
  if (kind === "RENEWAL_CLOSURE") return true;
  return kind === "REGULAR" || kind === "CASH" || kind === "PHONE";
}

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";
  
  const [
    villagesSnap,
    customersSnap,
    loansSnap,
    paymentsSnap,
    investmentsSnap,
    expensesSnap
  ] = await Promise.all([
    db.collection("villages").where("userId", "==", userId).get(),
    db.collection("customers").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get()
  ]);

  const villages = villagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const loansRaw = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const paymentsRaw = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const investments = investmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const villageById = new Map(villages.map(v => [v.id, v]));
  const activeCustomers = customers.filter(c => c.isActive !== false && villageById.has(c.villageId));
  const customerById = new Map(activeCustomers.map(c => [c.id, c]));

  // Normalize loans
  const loansNormalized = loansRaw.map(loan => ({
    ...loan,
    startDate: toMillis(loan.startDate ?? loan.start_date ?? loan.createdAt),
    principalAmount: getLoanPrincipalAmount(loan),
    distributedAmount: getLoanDistributedAmount(loan),
  }));

  const seenLoanKeys = new Set();
  const loans = loansNormalized.filter(loan => {
    const key = `${loan.customerId}:${loan.startDate}:${loan.principalAmount}:${loan.status}`;
    if (seenLoanKeys.has(key)) return false;
    seenLoanKeys.add(key);
    return true;
  });

  const customerIdByLoanId = new Map(loans.map(loan => [loan.id, loan.customerId]));

  const payments = paymentsRaw.map(payment => {
    const customerId = payment.customerId || customerIdByLoanId.get(payment.loanId);
    return {
      ...payment,
      paymentDate: toMillis(payment.paymentDate ?? payment.date),
      amountPaid: Number(payment.amountPaid || 0),
      customerId
    };
  });

  const regularPayments = payments.filter(p => !!p.customerId && customerById.has(p.customerId) && isRealCollectionPayment(p));
  const activeLoans = loans.filter(l => customerById.has(l.customerId));

  // We want to calculate totals by month
  const monthlyStats = {};

  const addStat = (year, month, type, amount) => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    if (!monthlyStats[key]) {
      monthlyStats[key] = { collected: 0, distributed: 0, invested: 0, expenses: 0 };
    }
    monthlyStats[key][type] += amount;
  };

  regularPayments.forEach(p => {
    const d = new Date(p.paymentDate);
    addStat(d.getFullYear(), d.getMonth(), "collected", p.amountPaid);
  });

  activeLoans.forEach(l => {
    const d = new Date(l.startDate);
    addStat(d.getFullYear(), d.getMonth(), "distributed", l.distributedAmount);
  });

  investments.forEach(i => {
    const d = new Date(toMillis(i.date));
    addStat(d.getFullYear(), d.getMonth(), "invested", money(i.amount));
  });

  expenses.forEach(e => {
    const d = new Date(toMillis(e.date));
    addStat(d.getFullYear(), d.getMonth(), "expenses", money(e.amount));
  });

  console.log("=== MONTHLY STATS ===");
  Object.keys(monthlyStats).sort().forEach(key => {
    console.log(`Month: ${key}`);
    console.log(JSON.stringify(monthlyStats[key], null, 2));
  });

  process.exit(0);
}

run().catch(console.error);
