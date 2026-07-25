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
  const customersRaw = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const loansRaw = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const paymentsRaw = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const investmentsRaw = investmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const expensesRaw = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const bfAmount = bfSnap.exists ? Number(bfSnap.data().amount || 0) : 0;
  const totalInvestments = investmentsRaw.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalExpenses = expensesRaw.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  const villageById = new Map(villages.map(v => [v.id, v]));

  // We have different subsets of customers:
  // 1. Active: isActive !== false && villageById.has(villageId)
  const activeCustomers = customersRaw.filter(c => c.isActive !== false && villageById.has(c.villageId));
  // 2. Active + Closed/Inactive (All customers):
  const allCustomers = customersRaw;

  // We will build customer maps
  const activeCustomerById = new Map(activeCustomers.map(c => [c.id, c]));
  const allCustomerById = new Map(allCustomers.map(c => [c.id, c]));

  // Normalize loans
  const loansNormalized = loansRaw.map(loan => ({
    ...loan,
    startDate: toMillis(loan.startDate ?? loan.start_date ?? loan.createdAt),
    principalAmount: getLoanPrincipalAmount(loan),
    distributedAmount: getLoanDistributedAmount(loan),
  }));

  // We have two loan lists: normalized and deduplicated
  const seenLoanKeys = new Set();
  const loansDeduplicated = loansNormalized.filter(loan => {
    const key = `${loan.customerId}:${loan.startDate}:${loan.principalAmount}:${loan.status}`;
    if (seenLoanKeys.has(key)) return false;
    seenLoanKeys.add(key);
    return true;
  });

  // Normalize payments
  const paymentsNormalized = paymentsRaw.map(payment => {
    // try to find customerId from loans if missing
    let customerId = payment.customerId || payment.customer_id;
    if (!customerId) {
      const loan = loansNormalized.find(l => l.id === (payment.loanId || payment.loan_id));
      if (loan) customerId = loan.customerId;
    }
    return {
      ...payment,
      paymentDate: toMillis(payment.paymentDate ?? payment.date),
      amountPaid: Number(payment.amountPaid ?? payment.amount_paid ?? payment.amount ?? 0),
      customerId
    };
  });

  const configs = [
    { name: "Active Customers Only, Deduplicated Loans", customerMap: activeCustomerById, loansList: loansDeduplicated },
    { name: "Active Customers Only, Raw Loans (No Deduplicate)", customerMap: activeCustomerById, loansList: loansNormalized },
    { name: "All Customers (Active + Inactive), Deduplicated Loans", customerMap: allCustomerById, loansList: loansDeduplicated },
    { name: "All Customers (Active + Inactive), Raw Loans (No Deduplicate)", customerMap: allCustomerById, loansList: loansNormalized },
    { name: "No Customer Filter (Raw Sums), Deduplicated Loans", customerMap: null, loansList: loansDeduplicated },
    { name: "No Customer Filter (Raw Sums), Raw Loans (No Deduplicate)", customerMap: null, loansList: loansNormalized },
  ];

  console.log("=== COMBINATIONS ANALYSIS ===");
  console.log(`totalInvestments: ${totalInvestments}`);
  console.log(`totalExpenses: ${totalExpenses}`);
  console.log(`bfAmount (global override): ${bfAmount}`);

  for (const config of configs) {
    console.log(`\n--- Config: ${config.name} ---`);
    
    // Filter payments
    let filteredPayments = paymentsNormalized;
    if (config.customerMap) {
      filteredPayments = paymentsNormalized.filter(p => !!p.customerId && config.customerMap.has(p.customerId));
    }
    const regularPayments = filteredPayments.filter(isRealCollectionPayment);
    const totalCollection = regularPayments.reduce((sum, p) => sum + p.amountPaid, 0);

    // Filter loans
    let filteredLoans = config.loansList;
    if (config.customerMap) {
      filteredLoans = config.loansList.filter(l => !!l.customerId && config.customerMap.has(l.customerId));
    }
    const totalDistributed = filteredLoans.reduce((sum, l) => sum + l.distributedAmount, 0);

    // Let's also calculate principal loan sum
    const totalPrincipalDistributed = filteredLoans.reduce((sum, l) => sum + l.principalAmount, 0);

    // Net cash with current BF (0)
    const netCashWithBf0 = bfAmount + totalInvestments + totalCollection - totalDistributed - totalExpenses;
    // Net cash if starting BF is 332920
    const netCashWithBf332920 = 332920 + totalInvestments + totalCollection - totalDistributed - totalExpenses;
    // Net cash with principal loans instead of distributed (with Bf 0)
    const netCashPrincipalBf0 = bfAmount + totalInvestments + totalCollection - totalPrincipalDistributed - totalExpenses;

    console.log(`Total Collection: ${totalCollection}`);
    console.log(`Total Distributed (disbursed amount): ${totalDistributed}`);
    console.log(`Total Distributed (principal amount): ${totalPrincipalDistributed}`);
    console.log(`Net Cash Position (BF=0, Distributed): ${netCashWithBf0}`);
    console.log(`Net Cash Position (BF=0, Principal): ${netCashPrincipalBf0}`);
    console.log(`Net Cash Position (BF=332920, Distributed): ${netCashWithBf332920}`);
  }

  process.exit(0);
}

run().catch(console.error);
