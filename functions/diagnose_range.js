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

function endOfDay(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function formatBalanceDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function balanceDateKeyToMillis(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ""));
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date.getTime()
    : 0;
}

async function getAccountOpeningBalanceForDate(userId, startMs, options = {}) {
  const targetStart = startOfDay(startMs);
  const targetDateKey = formatBalanceDateKey(targetStart);
  const previousDayEnd = endOfDay(targetStart - 1);

  const [globalBfSnap, dateBfsSnap, paymentsSnap, loansSnap, expensesSnap, investmentsSnap] = await Promise.all([
    db.collection("balancingFund").doc(userId).get(),
    db.collection("balancingFund").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
  ]);

  const dateBfs = dateBfsSnap.docs.map((docSnap) => docSnap.data());
  const exactOverride = dateBfs.find((item) => item?.dateStr === targetDateKey);
  console.log(`[getAccountOpeningBalanceForDate] Exact override for ${targetDateKey}:`, exactOverride);
  if (options.useExactDateOverride !== false && exactOverride) {
    return money(exactOverride.amount);
  }

  const latestOverride = dateBfs
    .map((item) => ({ ...item, timestamp: balanceDateKeyToMillis(item?.dateStr) }))
    .filter((item) => item.timestamp > 0 && item.timestamp <= previousDayEnd)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  console.log(`[getAccountOpeningBalanceForDate] Latest override before ${targetDateKey}:`, latestOverride);

  const startBalance = latestOverride
    ? money(latestOverride.amount)
    : money(globalBfSnap.exists ? globalBfSnap.data().amount : 0);
  const startLimit = latestOverride ? startOfDay(latestOverride.timestamp) : 0;

  const customerIdByLoanId = new Map(
    loansSnap.docs.map((d) => {
      const loan = d.data();
      return [d.id, loan.customerId];
    })
  );

  const sumInvs = investmentsSnap.docs
    .map((d) => d.data())
    .filter((investment) => investment.date >= startLimit && investment.date <= previousDayEnd)
    .reduce((sum, investment) => sum + money(investment.amount), 0);

  const sumColls = paymentsSnap.docs
    .map((docSnap) => ({
      amount: money(docSnap.data().amountPaid ?? docSnap.data().amount_paid ?? docSnap.data().amount),
      amountPaid: money(docSnap.data().amountPaid ?? docSnap.data().amount_paid ?? docSnap.data().amount),
      paymentDate: toMillis(docSnap.data().paymentDate ?? docSnap.data().date),
      paymentType: docSnap.data().paymentType ?? docSnap.data().type,
    }))
    .filter((payment) => {
      const ts = payment.paymentDate;
      return ts >= startLimit && ts <= previousDayEnd && isRealCollectionPayment(payment);
    })
    .reduce((sum, payment) => sum + payment.amountPaid, 0);

  const sumLoans = loansSnap.docs
    .map((d) => ({
      amount: getLoanDistributedAmount(d.data()),
      startDate: toMillis(d.data().startDate ?? d.data().start_date ?? d.data().createdAt),
    }))
    .filter((loan) => {
      const ts = loan.startDate;
      return ts >= startLimit && ts <= previousDayEnd;
    })
    .reduce((sum, loan) => sum + loan.amount, 0);

  const sumExps = expensesSnap.docs
    .map((d) => d.data())
    .filter((expense) => expense.date >= startLimit && expense.date <= previousDayEnd)
    .reduce((sum, expense) => sum + money(expense.amount), 0);

  console.log(`[getAccountOpeningBalanceForDate] startBalance: ${startBalance}, startLimit: ${startLimit}`);
  console.log(`sumInvs: ${sumInvs}, sumColls: ${sumColls}, sumLoans: ${sumLoans}, sumExps: ${sumExps}`);
  
  return startBalance + sumInvs + sumColls - sumLoans - sumExps;
}

async function getAccountSummaryForRange(userId, startMs, endMs) {
  const [paymentsSnap, loansSnap, expensesSnap, investmentsSnap] = await Promise.all([
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
  ]);

  const customerIdByLoanId = new Map(
    loansSnap.docs.map((d) => {
      const loan = d.data();
      return [d.id, loan.customerId];
    })
  );

  const payments = paymentsSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      amount: money(docSnap.data().amountPaid ?? docSnap.data().amount_paid ?? docSnap.data().amount),
      amountPaid: money(docSnap.data().amountPaid ?? docSnap.data().amount_paid ?? docSnap.data().amount),
      paymentDate: toMillis(docSnap.data().paymentDate ?? docSnap.data().date),
      paymentType: docSnap.data().paymentType ?? docSnap.data().type,
      customerId: docSnap.data().customerId ?? customerIdByLoanId.get(docSnap.data().loanId),
    }))
    .filter((payment) => {
      const ts = payment.paymentDate;
      return (
        ts >= startMs &&
        ts <= endMs &&
        isRealCollectionPayment(payment) &&
        !!payment.customerId
      );
    });

  const loans = loansSnap.docs
    .map((d) => ({
      id: d.id,
      amount: getLoanDistributedAmount(d.data()),
      startDate: toMillis(d.data().startDate ?? d.data().start_date ?? d.data().createdAt),
      customerId: d.data().customerId,
    }))
    .filter((loan) => {
      const ts = loan.startDate;
      return (
        ts >= startMs &&
        ts <= endMs &&
        !!loan.customerId
      );
    });

  const expenses = expensesSnap.docs
    .map((d) => {
      const data = d.data();
      return { ...data, id: d.id || data.id };
    })
    .filter((expense) => expense.date >= startMs && expense.date <= endMs);

  const investments = investmentsSnap.docs
    .map((d) => {
      const data = d.data();
      return { ...data, id: d.id || data.id };
    })
    .filter((investment) => investment.date >= startMs && investment.date <= endMs);

  return { payments, loans, expenses, investments };
}

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";
  const startMs = new Date(2026, 5, 1).getTime(); // June 1, 2026
  const endMs = endOfDay(new Date(2026, 5, 25).getTime()); // June 25, 2026

  console.log("=== June 1 to June 25, 2026 range ===");
  const bf = await getAccountOpeningBalanceForDate(userId, startMs, { useExactDateOverride: false });
  const summary = await getAccountSummaryForRange(userId, startMs, endMs);

  const sumInvs = summary.investments.reduce((sum, i) => sum + i.amount, 0);
  const sumColls = summary.payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const sumLoans = summary.loans.reduce((sum, l) => sum + l.amount, 0);
  const sumExps = summary.expenses.reduce((sum, e) => sum + e.amount, 0);
  const netTotal = bf + sumInvs + sumColls - sumLoans - sumExps;

  console.log("bf:", bf);
  console.log("sumInvs:", sumInvs);
  console.log("sumColls:", sumColls);
  console.log("sumLoans:", sumLoans);
  console.log("sumExps:", sumExps);
  console.log("netTotal (Net Cash Position in Live Summary):", netTotal);

  process.exit(0);
}

run().catch(console.error);
