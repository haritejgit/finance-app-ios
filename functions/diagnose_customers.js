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
    paymentsSnap
  ] = await Promise.all([
    db.collection("villages").where("userId", "==", userId).get(),
    db.collection("customers").where("userId", "==", userId).get(),
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get()
  ]);

  const villages = villagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const loansRaw = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const paymentsRaw = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const villageById = new Map(villages.map(v => [v.id, v]));

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

  // Normalize payments
  const payments = paymentsRaw.map(payment => {
    let customerId = payment.customerId || payment.customer_id;
    if (!customerId) {
      const loan = loans.find(l => l.id === (payment.loanId || payment.loan_id));
      if (loan) customerId = loan.customerId;
    }
    return {
      ...payment,
      paymentDate: toMillis(payment.paymentDate ?? payment.date),
      amountPaid: Number(payment.amountPaid ?? payment.amount_paid ?? payment.amount ?? 0),
      customerId
    };
  });

  console.log(`Total Customers in DB: ${customers.length}`);
  
  // Calculate per customer sums
  const customerStats = [];

  for (const customer of customers) {
    const customerLoans = loans.filter(l => l.customerId === customer.id);
    const customerPayments = payments.filter(p => p.customerId === customer.id && isRealCollectionPayment(p));

    const totalDistributed = customerLoans.reduce((sum, l) => sum + l.distributedAmount, 0);
    const totalPrincipal = customerLoans.reduce((sum, l) => sum + l.principalAmount, 0);
    const totalCollection = customerPayments.reduce((sum, p) => sum + p.amountPaid, 0);
    const netImpact = totalCollection - totalDistributed;

    const village = villageById.get(customer.villageId);

    customerStats.push({
      id: customer.id,
      name: customer.name,
      numericalId: customer.numericalId,
      isActive: customer.isActive !== false,
      hasVillage: !!village,
      loansCount: customerLoans.length,
      totalDistributed,
      totalPrincipal,
      totalCollection,
      netImpact
    });
  }

  // Print inactive customers or customers with village missing
  console.log("\n=== Inactive / Closed or Village Missing Customers ===");
  customerStats
    .filter(c => !c.isActive || !c.hasVillage)
    .forEach(c => {
      console.log(`ID: ${c.id}, Name: ${c.name}, Numerical ID: ${c.numericalId}, Active: ${c.isActive}, HasVillage: ${c.hasVillage}`);
      console.log(`  Loans count: ${c.loansCount}, Total Distributed: ${c.totalDistributed}, Total Collection: ${c.totalCollection}, Net Impact: ${c.netImpact}`);
    });

  // Check if there is any set of customers whose netImpact sum is close to -56530 or 56530
  // or whose total collection sum is 56530
  console.log("\n=== Total Collections for Inactive Customers ===");
  const inactiveCollection = customerStats.filter(c => !c.isActive).reduce((sum, c) => sum + c.totalCollection, 0);
  const inactiveDistributed = customerStats.filter(c => !c.isActive).reduce((sum, c) => sum + c.totalDistributed, 0);
  console.log(`Total Collection from Inactive: ${inactiveCollection}`);
  console.log(`Total Distributed to Inactive: ${inactiveDistributed}`);

  process.exit(0);
}

run().catch(console.error);
