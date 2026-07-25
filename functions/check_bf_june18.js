const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "service-account-key.json");
if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
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

function money(val) { const n = Number(val); return Number.isFinite(n) ? n : 0; }
function getLoanPrincipalAmount(loan) { return money(loan.principalAmount ?? loan.principal_amount ?? loan.loanAmount ?? loan.amount); }
function getLoanDistributedAmount(loan) { const p = getLoanPrincipalAmount(loan); return Math.max(0, p - Math.floor(p / 1000) * 20); }
function isRealCollectionPayment(payment) {
  const kind = payment.paymentType ?? payment.type ?? "REGULAR";
  if (kind === "DUE") return Number(payment.amountPaid || 0) > 0;
  if (kind === "RENEWAL_CLOSURE") return true;
  return kind === "REGULAR" || kind === "CASH" || kind === "PHONE";
}
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function endOfDay(ts) { const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime(); }

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";
  
  // Simulate getAccountOpeningBalanceForDate for June 18
  const targetStart = startOfDay(new Date(2026, 5, 18).getTime());
  const previousDayEnd = endOfDay(targetStart - 1); // End of June 17
  
  const [globalBfSnap, villagesSnap, customersSnap, loansSnap, paymentsSnap, investmentsSnap, expensesSnap] = await Promise.all([
    db.collection("balancingFund").doc(userId).get(),
    db.collection("villages").where("userId", "==", userId).get(),
    db.collection("customers").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get(),
  ]);

  const villages = villagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const villageById = new Map(villages.map(v => [v.id, v]));
  const activeCustomers = customers.filter(c => c.isActive !== false && villageById.has(c.villageId));
  const activeCustomerById = new Map(activeCustomers.map(c => [c.id, c]));

  const startBalance = money(globalBfSnap.exists ? globalBfSnap.data().amount : 0);

  // === WITHOUT customer filter (what getAccountOpeningBalanceForDate does now) ===
  const allLoans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const customerIdByLoanId = new Map(allLoans.map(l => [l.id, l.customerId]));
  
  const sumInvsNoFilter = investmentsSnap.docs.map(d => d.data())
    .filter(i => i.date >= 0 && i.date <= previousDayEnd)
    .reduce((s, i) => s + money(i.amount), 0);
    
  const sumCollsNoFilter = paymentsSnap.docs.map(d => {
    const data = d.data();
    return {
      amountPaid: money(data.amountPaid ?? data.amount_paid ?? data.amount),
      paymentDate: toMillis(data.paymentDate ?? data.date),
      paymentType: data.paymentType ?? data.type,
      customerId: data.customerId ?? customerIdByLoanId.get(data.loanId),
    };
  }).filter(p => p.paymentDate >= 0 && p.paymentDate <= previousDayEnd && isRealCollectionPayment(p))
    .reduce((s, p) => s + p.amountPaid, 0);
    
  const sumLoansNoFilter = loansSnap.docs.map(d => {
    const data = d.data();
    return {
      amount: getLoanDistributedAmount(data),
      startDate: toMillis(data.startDate ?? data.start_date ?? data.createdAt),
    };
  }).filter(l => l.startDate >= 0 && l.startDate <= previousDayEnd)
    .reduce((s, l) => s + l.amount, 0);
    
  const sumExpsNoFilter = expensesSnap.docs.map(d => d.data())
    .filter(e => e.date >= 0 && e.date <= previousDayEnd)
    .reduce((s, e) => s + money(e.amount), 0);

  const bfNoFilter = startBalance + sumInvsNoFilter + sumCollsNoFilter - sumLoansNoFilter - sumExpsNoFilter;

  console.log("=== WITHOUT Customer Filter (current app behavior) ===");
  console.log(`BF: ${startBalance}, Inv: ${sumInvsNoFilter}, Coll: ${sumCollsNoFilter}, Loans: ${sumLoansNoFilter}, Exp: ${sumExpsNoFilter}`);
  console.log(`Opening Balance for June 18: ${bfNoFilter}`);

  // === WITH active customer filter ===
  const sumCollsFiltered = paymentsSnap.docs.map(d => {
    const data = d.data();
    return {
      amountPaid: money(data.amountPaid ?? data.amount_paid ?? data.amount),
      paymentDate: toMillis(data.paymentDate ?? data.date),
      paymentType: data.paymentType ?? data.type,
      customerId: data.customerId ?? customerIdByLoanId.get(data.loanId),
    };
  }).filter(p => p.paymentDate >= 0 && p.paymentDate <= previousDayEnd && 
             isRealCollectionPayment(p) && p.customerId && activeCustomerById.has(p.customerId))
    .reduce((s, p) => s + p.amountPaid, 0);
    
  const sumLoansFiltered = loansSnap.docs.map(d => {
    const data = d.data();
    return {
      amount: getLoanDistributedAmount(data),
      startDate: toMillis(data.startDate ?? data.start_date ?? data.createdAt),
      customerId: data.customerId ?? data.customer_id,
    };
  }).filter(l => l.startDate >= 0 && l.startDate <= previousDayEnd && l.customerId && activeCustomerById.has(l.customerId))
    .reduce((s, l) => s + l.amount, 0);

  const bfFiltered = startBalance + sumInvsNoFilter + sumCollsFiltered - sumLoansFiltered - sumExpsNoFilter;

  console.log("\n=== WITH Active Customer Filter (matches analytics & user's ledger) ===");
  console.log(`BF: ${startBalance}, Inv: ${sumInvsNoFilter}, Coll: ${sumCollsFiltered}, Loans: ${sumLoansFiltered}, Exp: ${sumExpsNoFilter}`);
  console.log(`Opening Balance for June 18: ${bfFiltered}`);
  console.log(`\nUser expects: 432300`);
  console.log(`Diff (no filter): ${bfNoFilter - 432300}`);
  console.log(`Diff (with filter): ${bfFiltered - 432300}`);

  process.exit(0);
}

run().catch(console.error);
