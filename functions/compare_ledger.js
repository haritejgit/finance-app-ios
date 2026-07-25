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

function getLoanDistributedAmount(loan) {
  const principal = getLoanPrincipalAmount(loan);
  return Math.max(0, principal - Math.floor(principal / 1000) * 20);
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

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";

  // Period: 11/06/2026 - 18/06/2026
  const periodStart = startOfDay(new Date(2026, 5, 11).getTime()); // June 11
  const periodEnd = endOfDay(new Date(2026, 5, 18).getTime());     // June 18
  const beforePeriodEnd = endOfDay(new Date(2026, 5, 10).getTime()); // June 10 end (day before period)

  // Also check: today's closing (June 25)
  const todayEnd = endOfDay(new Date(2026, 5, 25).getTime());

  console.log(`Period: ${new Date(periodStart).toLocaleDateString()} - ${new Date(periodEnd).toLocaleDateString()}`);

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
  const activeCustomerById = new Map(activeCustomers.map(c => [c.id, c]));

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
      paymentDate: toMillis(payment.paymentDate),
      amountPaid: Number(payment.amountPaid || 0),
      customerId
    };
  });

  const bfAmount = bfSnap.exists ? Number(bfSnap.data().amount || 0) : 0;

  // ========= CALCULATIONS FOR ALL TIME UP TO JUNE 10 (Opening Balance for June 11) =========
  const activeLoansBeforePeriod = loans.filter(l => 
    activeCustomerById.has(l.customerId) && l.startDate <= beforePeriodEnd
  );
  const activePaymentsBeforePeriod = payments.filter(p => 
    p.customerId && activeCustomerById.has(p.customerId) && 
    p.paymentDate <= beforePeriodEnd && isRealCollectionPayment(p)
  );
  const investmentsBeforePeriod = investments.filter(i => i.date <= beforePeriodEnd);
  const expensesBeforePeriod = expenses.filter(e => e.date <= beforePeriodEnd);

  const totalDistBefore = activeLoansBeforePeriod.reduce((s, l) => s + l.distributedAmount, 0);
  const totalCollBefore = activePaymentsBeforePeriod.reduce((s, p) => s + p.amountPaid, 0);
  const totalInvBefore = investmentsBeforePeriod.reduce((s, i) => s + money(i.amount), 0);
  const totalExpBefore = expensesBeforePeriod.reduce((s, e) => s + money(e.amount), 0);
  const openingBalanceCalculated = bfAmount + totalInvBefore + totalCollBefore - totalDistBefore - totalExpBefore;

  console.log("\n=== OPENING BALANCE FOR 11/06/2026 ===");
  console.log(`BF (global): ${bfAmount}`);
  console.log(`Total Investments (up to 10/06): ${totalInvBefore}`);
  console.log(`Total Collections (up to 10/06): ${totalCollBefore}`);
  console.log(`Total Distributed (up to 10/06): ${totalDistBefore}`);
  console.log(`Total Expenses (up to 10/06): ${totalExpBefore}`);
  console.log(`=> Calculated Opening Balance: ${openingBalanceCalculated}`);
  console.log(`=> User's BF: 436170`);
  console.log(`=> Difference: ${openingBalanceCalculated - 436170}`);

  // ========= PERIOD 11/06 - 18/06 =========
  const periodLoans = loans.filter(l => 
    activeCustomerById.has(l.customerId) && 
    l.startDate >= periodStart && l.startDate <= periodEnd
  );
  const periodPayments = payments.filter(p => 
    p.customerId && activeCustomerById.has(p.customerId) && 
    p.paymentDate >= periodStart && p.paymentDate <= periodEnd && 
    isRealCollectionPayment(p)
  );
  const periodInvestments = investments.filter(i => i.date >= periodStart && i.date <= periodEnd);
  const periodExpenses = expenses.filter(e => e.date >= periodStart && e.date <= periodEnd);

  const periodColl = periodPayments.reduce((s, p) => s + p.amountPaid, 0);
  const periodDist = periodLoans.reduce((s, l) => s + l.distributedAmount, 0);
  const periodDistPrincipal = periodLoans.reduce((s, l) => s + l.principalAmount, 0);
  const periodInv = periodInvestments.reduce((s, i) => s + money(i.amount), 0);
  const periodExp = periodExpenses.reduce((s, e) => s + money(e.amount), 0);

  console.log("\n=== PERIOD 11/06 - 18/06/2026 ===");
  console.log(`Collections: ${periodColl} (User says: 142250)`);
  console.log(`Distributed (after deduction): ${periodDist} (User says: 131320)`);
  console.log(`Distributed (principal): ${periodDistPrincipal}`);
  console.log(`Investments: ${periodInv}`);
  console.log(`Expenses: ${periodExp} (User says: 14800)`);
  console.log(`Collection diff: ${periodColl - 142250}`);
  console.log(`Distribution diff: ${periodDist - 131320}`);
  console.log(`Expense diff: ${periodExp - 14800}`);

  // Detail expenses
  console.log("\n--- Expense Details (11/06 - 18/06) ---");
  periodExpenses.forEach(e => {
    console.log(`  ${new Date(e.date).toLocaleDateString()} | ${e.description || e.category || 'N/A'} | Rs.${e.amount}`);
  });

  // Detail loans
  console.log(`\n--- Loan Details (11/06 - 18/06) [${periodLoans.length} loans] ---`);
  periodLoans.forEach(l => {
    console.log(`  ${new Date(l.startDate).toLocaleDateString()} | Principal: ${l.principalAmount} | Distributed: ${l.distributedAmount} | Customer: ${l.customerId}`);
  });

  // Closing balance for 18/06
  const closingCalc = openingBalanceCalculated + periodColl + periodInv - periodDist - periodExp;
  console.log(`\n=== CLOSING BALANCE 18/06/2026 ===`);
  console.log(`Calculated: ${closingCalc}`);
  console.log(`User says: 432300`);
  console.log(`Difference: ${closingCalc - 432300}`);

  // ========= ALL TIME UP TO TODAY (June 25) - Net Cash Position =========
  const allLoansActive = loans.filter(l => activeCustomerById.has(l.customerId));
  const allPaymentsActive = payments.filter(p => 
    p.customerId && activeCustomerById.has(p.customerId) && isRealCollectionPayment(p)
  );
  const totalDist = allLoansActive.reduce((s, l) => s + l.distributedAmount, 0);
  const totalColl = allPaymentsActive.reduce((s, p) => s + p.amountPaid, 0);
  const totalInv = investments.reduce((s, i) => s + money(i.amount), 0);
  const totalExp = expenses.reduce((s, e) => s + money(e.amount), 0);
  const netCashToday = bfAmount + totalInv + totalColl - totalDist - totalExp;

  console.log(`\n=== NET CASH POSITION (ALL TIME, today June 25) ===`);
  console.log(`BF: ${bfAmount}, Inv: ${totalInv}, Coll: ${totalColl}, Dist: ${totalDist}, Exp: ${totalExp}`);
  console.log(`Net Cash Position: ${netCashToday}`);

  // ========= PERIOD 19/06 - 25/06 (after the statement) =========
  const afterStart = startOfDay(new Date(2026, 5, 19).getTime());
  const afterLoans = loans.filter(l => 
    activeCustomerById.has(l.customerId) && l.startDate >= afterStart && l.startDate <= todayEnd
  );
  const afterPayments = payments.filter(p => 
    p.customerId && activeCustomerById.has(p.customerId) && 
    p.paymentDate >= afterStart && p.paymentDate <= todayEnd && isRealCollectionPayment(p)
  );
  const afterInvestments = investments.filter(i => i.date >= afterStart && i.date <= todayEnd);
  const afterExpenses = expenses.filter(e => e.date >= afterStart && e.date <= todayEnd);

  const afterColl = afterPayments.reduce((s, p) => s + p.amountPaid, 0);
  const afterDist = afterLoans.reduce((s, l) => s + l.distributedAmount, 0);
  const afterInv = afterInvestments.reduce((s, i) => s + money(i.amount), 0);
  const afterExp = afterExpenses.reduce((s, e) => s + money(e.amount), 0);

  console.log(`\n=== PERIOD 19/06 - 25/06/2026 (after statement) ===`);
  console.log(`Collections: ${afterColl}`);
  console.log(`Distributed: ${afterDist}`);
  console.log(`Investments: ${afterInv}`);
  console.log(`Expenses: ${afterExp}`);
  console.log(`Net change: ${afterColl + afterInv - afterDist - afterExp}`);

  // If user's closing was 432300 on 18/06, what should today's balance be?
  const projectedToday = 432300 + afterColl + afterInv - afterDist - afterExp;
  console.log(`\n=== IF BF on 18/06 = 432300, projected today ===`);
  console.log(`Projected Net Cash Today: ${projectedToday}`);
  console.log(`App currently shows (calculated): ${netCashToday}`);
  console.log(`Gap between user's ledger and app: ${projectedToday - netCashToday}`);

  process.exit(0);
}

run().catch(console.error);
