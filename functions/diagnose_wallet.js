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

function modeOrCash(value) {
  return value === "PHONE" ? "PHONE" : "CASH";
}

function inRange(value, openingDate) {
  return toMillis(value) >= openingDate;
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

function calculateWalletBalances(profile, loans, payments, expenses, investments) {
  const openingDate = toMillis(profile.walletOpeningDate) || 0;
  const cashOpening = money(profile.cashOpeningBalance);
  const phoneOpening = money(profile.phonePeOpeningBalance);

  const walletLoans = loans.filter((loan) => inRange(loan.startDate ?? loan.start_date, openingDate));
  const walletPayments = payments.filter((payment) => inRange(payment.paymentDate ?? payment.payment_date, openingDate));
  const walletExpenses = expenses.filter((expense) => inRange(expense.date, openingDate));
  const walletInvestments = investments.filter((investment) => inRange(investment.date, openingDate));

  const sumLoans = (mode) =>
    walletLoans
      .filter((loan) => modeOrCash(loan.disbursement_mode ?? loan.disbursementMode) === mode)
      .reduce((sum, loan) => sum + getLoanDistributedAmount(loan), 0);

  const sumPayments = (mode) =>
    walletPayments
      .filter(isRealCollectionPayment)
      .filter((payment) => modeOrCash(payment.type === "PHONE" ? "PHONE" : payment.paymentMode) === mode)
      .reduce((sum, payment) => sum + money(payment.amountPaid ?? payment.amount_paid), 0);

  const sumExpenses = (mode) =>
    walletExpenses
      .filter((expense) => modeOrCash(expense.payment_mode) === mode)
      .reduce((sum, expense) => sum + money(expense.amount), 0);

  const sumInvestments = (mode) =>
    walletInvestments
      .filter((investment) => modeOrCash(investment.payment_mode) === mode)
      .reduce((sum, investment) => sum + money(investment.amount), 0);

  const cash = buildBreakdown(cashOpening, sumLoans("CASH"), sumPayments("CASH"), sumExpenses("CASH"), sumInvestments("CASH"));
  const phonePe = buildBreakdown(phoneOpening, sumLoans("PHONE"), sumPayments("PHONE"), sumExpenses("PHONE"), sumInvestments("PHONE"));

  return {
    openingDate,
    cash,
    phonePe,
    totalAvailable: cash.current + phonePe.current,
  };
}

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";
  const userSnap = await db.collection("users").doc(userId).get();
  const profile = userSnap.data();
  console.log("User profile opening date:", new Date(profile.walletOpeningDate).toISOString());
  console.log("Profile details:", profile);

  const [
    villagesSnap,
    customersSnap,
    loansSnap,
    paymentsSnap,
    investmentsSnap,
    expensesSnap,
    bfSnap
  ] = await Promise.all([
    db.collection("villages").where("userId", "==", userId).get(),
    db.collection("customers").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get(),
    db.collection("balancingFund").doc(userId).get()
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
    startDate: toMillis(loan.startDate),
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
      paymentDate: toMillis(payment.paymentDate),
      amountPaid: Number(payment.amountPaid || 0),
      customerId
    };
  });

  const regularPayments = payments.filter(p => !!p.customerId && customerById.has(p.customerId) && isRealCollectionPayment(p));
  const activeLoans = loans.filter(l => customerById.has(l.customerId));

  const totalCollection = regularPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const totalDistributed = activeLoans.reduce((sum, loan) => sum + loan.distributedAmount, 0);
  const totalInvestments = investments.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const bfAmount = bfSnap.exists ? Number(bfSnap.data().amount || 0) : 0;

  const netCashPosition = bfAmount + totalInvestments + totalCollection - totalDistributed - totalExpenses;

  const walletBalances = calculateWalletBalances(profile, loans, payments, expenses, investments);

  console.log("\n=== Calculated Totals ===");
  console.log("totalCollection:", totalCollection);
  console.log("totalDistributed:", totalDistributed);
  console.log("totalInvestments:", totalInvestments);
  console.log("totalExpenses:", totalExpenses);
  console.log("bfAmount:", bfAmount);
  console.log("netCashPosition:", netCashPosition);
  console.log("\n=== Wallet Balances ===");
  console.log("Cash Wallet:", walletBalances.cash);
  console.log("PhonePe Wallet:", walletBalances.phonePe);
  console.log("Total Available:", walletBalances.totalAvailable);

  process.exit(0);
}

run().catch(console.error);
