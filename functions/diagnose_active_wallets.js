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

function modeOrCash(value) {
  return value === "PHONE" ? "PHONE" : "CASH";
}

function buildBreakdown(opening, disbursed, collected, expenses, investments) {
  return {
    opening,
    disbursed,
    collected,
    expenses,
    investments,
    current: opening + collected + investments - disbursed - expenses,
  };
}

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";

  const [
    villagesSnap,
    customersSnap,
    loansSnap,
    paymentsSnap,
    investmentsSnap,
    expensesSnap,
  ] = await Promise.all([
    db.collection("villages").where("userId", "==", userId).get(),
    db.collection("customers").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get(),
  ]);

  const villages = villagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const loansRaw = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const paymentsRaw = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const investments = investmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const villageById = new Map(villages.map(v => [v.id, v]));
  const activeCustomers = customers.filter(c => c.isActive !== false && villageById.has(c.villageId));
  const activeCustomerById = new Map(activeCustomers.map(c => [c.id, c]));
  const allCustomerById = new Map(customers.map(c => [c.id, c]));

  // Normalize loans
  const loansNormalized = loansRaw.map(loan => ({
    ...loan,
    startDate: toMillis(loan.startDate),
    principalAmount: getLoanPrincipalAmount(loan),
    distributedAmount: getLoanDistributedAmount(loan),
  }));

  const seenLoanKeys = new Set();
  const loansDeduplicated = loansNormalized.filter(loan => {
    const key = `${loan.customerId}:${loan.startDate}:${loan.principalAmount}:${loan.status}`;
    if (seenLoanKeys.has(key)) return false;
    seenLoanKeys.add(key);
    return true;
  });

  const customerIdByLoanId = new Map(loansDeduplicated.map(loan => [loan.id, loan.customerId]));

  const paymentsNormalized = paymentsRaw.map(payment => {
    const customerId = payment.customerId || customerIdByLoanId.get(payment.loanId);
    return {
      ...payment,
      paymentDate: toMillis(payment.paymentDate),
      amountPaid: Number(payment.amountPaid || 0),
      paymentMode: payment.paymentMode || payment.payment_mode || payment.paymentMethod || (payment.type === "PHONE" ? "PHONE" : "CASH"),
      customerId
    };
  });

  const calculateForConfig = (name, customerMap) => {
    console.log(`\n--- Wallet Breakdown for: ${name} ---`);
    const filteredLoans = loansDeduplicated.filter(l => !customerMap || (l.customerId && customerMap.has(l.customerId)));
    const filteredPayments = paymentsNormalized.filter(p => !customerMap || (p.customerId && customerMap.has(p.customerId)));
    const filteredExpenses = expenses;
    const filteredInvestments = investments;

    const sumLoans = (mode) =>
      filteredLoans
        .filter((loan) => modeOrCash(loan.disbursement_mode ?? loan.disbursementMode) === mode)
        .reduce((sum, loan) => sum + loan.distributedAmount, 0);

    const sumPayments = (mode) =>
      filteredPayments
        .filter(isRealCollectionPayment)
        .filter((payment) => modeOrCash(payment.paymentMode) === mode)
        .reduce((sum, payment) => sum + payment.amountPaid, 0);

    const sumExpenses = (mode) =>
      filteredExpenses
        .filter((expense) => modeOrCash(expense.payment_mode) === mode)
        .reduce((sum, expense) => sum + money(expense.amount), 0);

    const sumInvestments = (mode) =>
      filteredInvestments
        .filter((investment) => modeOrCash(investment.payment_mode) === mode)
        .reduce((sum, investment) => sum + money(investment.amount), 0);

    const cash = buildBreakdown(0, sumLoans("CASH"), sumPayments("CASH"), sumExpenses("CASH"), sumInvestments("CASH"));
    const phonePe = buildBreakdown(0, sumLoans("PHONE"), sumPayments("PHONE"), sumExpenses("PHONE"), sumInvestments("PHONE"));

    console.log("Cash Wallet:", cash);
    console.log("PhonePe Wallet:", phonePe);
    console.log("Total Wallet Funds:", cash.current + phonePe.current);
  };

  calculateForConfig("Active Customers Only", activeCustomerById);
  calculateForConfig("All Customers (Active + Inactive)", allCustomerById);
  calculateForConfig("No Customer Filter (Raw Sums)", null);

  process.exit(0);
}

run().catch(console.error);
