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

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

async function getDashboardAnalytics(userId) {
  const [
    villagesSnap,
    customersSnap,
    loansSnap,
    paymentsSnap,
    investmentsSnap,
    expensesSnap,
    bfSnap,
    userSnap
  ] = await Promise.all([
    db.collection("villages").where("userId", "==", userId).get(),
    db.collection("customers").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get(),
    db.collection("balancingFund").doc(userId).get(),
    db.collection("users").doc(userId).get()
  ]);

  let bfAmount = 0;
  if (bfSnap.exists) {
    bfAmount = Number(bfSnap.data().amount || 0);
  }

  const userProfile = userSnap.exists ? userSnap.data() : {};

  const villages = villagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const customersRaw = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const loansRaw = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const paymentsRaw = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const investmentsRaw = investmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const expensesRaw = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const villageById = new Map(villages.map((v) => [v.id, v]));
  const customers = customersRaw.filter((c) => c.isActive !== false && villageById.has(c.villageId));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  
  const loansNormalized = loansRaw.map((loan) => ({
    ...loan,
    startDate: toMillis(loan.startDate ?? loan.start_date ?? loan.createdAt),
    principalAmount: getLoanPrincipalAmount(loan),
    distributedAmount: getLoanDistributedAmount(loan),
    balanceAmount: money(loan.balanceAmount),
    totalPayable: money(loan.totalPayable),
  }));

  const seenLoanKeys = new Set();
  const loans = loansNormalized.filter((loan) => {
    const key = `${loan.customerId}:${loan.startDate}:${loan.principalAmount}:${loan.status}`;
    if (seenLoanKeys.has(key)) return false;
    seenLoanKeys.add(key);
    return true;
  });

  const activeLoans = loans.filter((loan) => loan.status === "ACTIVE" && customerById.has(loan.customerId));
  const customerIdByLoanId = new Map(loans.map((loan) => [loan.id, loan.customerId]));
  
  const payments = paymentsRaw
    .map((payment) => ({
      ...payment,
      paymentDate: toMillis(payment.paymentDate ?? payment.date),
      amountPaid: money(payment.amountPaid ?? payment.amount_paid),
      customerId: payment.customerId ?? customerIdByLoanId.get(payment.loanId),
    }))
    .filter((payment) => !!payment.customerId && customerById.has(payment.customerId));

  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();
  const todayStart = startOfDay(Date.now());
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  const regularPayments = payments.filter(isRealCollectionPayment);
  const totalCollection = regularPayments.reduce((sum, p) => sum + p.amountPaid, 0);
  const monthlyRevenue = regularPayments
    .filter((p) => p.paymentDate >= monthStart && p.paymentDate <= monthEnd)
    .reduce((sum, p) => sum + p.amountPaid, 0);

  const pendingAmount = activeLoans.reduce((sum, loan) => sum + loan.balanceAmount, 0);
  const distributedThisMonth = loans
    .filter((loan) => customerById.has(loan.customerId))
    .filter((loan) => loan.startDate >= monthStart && loan.startDate <= monthEnd)
    .reduce((sum, loan) => sum + loan.distributedAmount, 0);

  const totalInvestments = investmentsRaw.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalExpenses = expensesRaw.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  
  const totalDistributed = loans
    .filter((loan) => customerById.has(loan.customerId))
    .reduce((sum, loan) => sum + loan.distributedAmount, 0);

  const netCashPosition = bfAmount + totalInvestments + totalCollection - totalDistributed - totalExpenses;

  console.log("=== DASHBOARD TOTALS ===");
  console.log("totalCollection:", totalCollection);
  console.log("totalDistributed:", totalDistributed);
  console.log("pendingAmount:", pendingAmount);
  console.log("totalInvestments:", totalInvestments);
  console.log("totalExpenses:", totalExpenses);
  console.log("bfAmount (balancing fund override):", bfAmount);
  console.log("netCashPosition:", netCashPosition);
}

run().catch(console.error);

async function run() {
  await getDashboardAnalytics("pVysC9oDOfeE26aGETPMkstYhX22");
  process.exit(0);
}
