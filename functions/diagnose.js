const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "service-account-key.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Initialized Firebase Admin using service-account-key.json");
} else {
  admin.initializeApp();
  console.log("Initialized Firebase Admin using default credentials");
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

// Business logic functions from codebase for loan amount adjustments
function getLoanPrincipalAmount(loan) {
  const amount = Number(loan.principalAmount || loan.amount || 0);
  return amount;
}

function getLoanDistributedAmount(loan) {
  const amount = getLoanPrincipalAmount(loan);
  // Deduction rule: reduce 20 for every 1000
  const deduction = Math.floor(amount / 1000) * 20;
  return amount - deduction;
}

function isRealCollectionPayment(payment) {
  // If payment is a due mark, closure, or renewal payment, is it a real collection?
  // Let's look at how isRealCollectionPayment is defined in the codebase
  // Normally: paymentType is "COLLECTION" or similar, and status/type is not "DUE"
  const type = payment.paymentType || "COLLECTION";
  return type !== "DUE";
}

async function run() {
  console.log("Fetching users...");
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} users.`);
  const userIds = [];
  usersSnap.forEach(doc => {
    userIds.push(doc.id);
    console.log(`User ID: ${doc.id}, Name: ${doc.data().name || doc.data().displayName || doc.data().email}`);
  });

  if (userIds.length === 0) {
    // try to find users from loans
    const loansSnap = await db.collection("loans").limit(10).get();
    const seenUsers = new Set();
    loansSnap.forEach(doc => {
      if (doc.data().userId) seenUsers.add(doc.data().userId);
    });
    userIds.push(...Array.from(seenUsers));
    console.log("No users in users collection, found user IDs from loans:", userIds);
  }

  for (const userId of userIds) {
    console.log(`\n=================== ANALYZING USER: ${userId} ===================`);
    
    // Fetch all collections
    const [
      villagesSnap,
      customersSnap,
      loansSnap,
      paymentsSnap,
      investmentsSnap,
      expensesSnap,
      bfSnap,
      allBfsSnap
    ] = await Promise.all([
      db.collection("villages").where("userId", "==", userId).get(),
      db.collection("customers").where("userId", "==", userId).get(),
      db.collection("loans").where("userId", "==", userId).get(),
      db.collection("payments").where("userId", "==", userId).get(),
      db.collection("investments").where("userId", "==", userId).get(),
      db.collection("expenses").where("userId", "==", userId).get(),
      db.collection("balancingFund").doc(userId).get(),
      db.collection("balancingFund").get()
    ]);

    console.log(`Villages in DB: ${villagesSnap.size}`);
    console.log(`Customers in DB: ${customersSnap.size}`);
    console.log(`Loans in DB: ${loansSnap.size}`);
    console.log(`Payments in DB: ${paymentsSnap.size}`);
    console.log(`Investments in DB: ${investmentsSnap.size}`);
    console.log(`Expenses in DB: ${expensesSnap.size}`);
    
    let bfAmount = 0;
    if (bfSnap.exists) {
      bfAmount = Number(bfSnap.data().amount || 0);
      console.log(`Balancing Fund override amount: ${bfAmount}`);
    } else {
      console.log(`No Balancing Fund override document found for user ${userId}`);
    }

    console.log("\nAll balancingFund documents in collection:");
    allBfsSnap.forEach(d => {
      console.log(`Doc ID: ${d.id}, data:`, d.data());
    });

    const villages = villagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const customersRaw = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const loansRaw = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const paymentsRaw = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const investmentsRaw = investmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const expensesRaw = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const villageById = new Map(villages.map(v => [v.id, v]));

    // Filter customers: active status check
    const activeCustomers = customersRaw.filter(c => c.isActive !== false && villageById.has(c.villageId));
    console.log(`Active Customers (isActive !== false && has village): ${activeCustomers.length}`);
    console.log(`Inactive Customers: ${customersRaw.length - activeCustomers.length}`);

    const customerById = new Map(activeCustomers.map(c => [c.id, c]));
    const customerByIdAll = new Map(customersRaw.map(c => [c.id, c]));

    // Normalize loans
    const loansNormalized = loansRaw.map(loan => ({
      ...loan,
      startDate: toMillis(loan.startDate),
      principalAmount: getLoanPrincipalAmount(loan),
      distributedAmount: getLoanDistributedAmount(loan),
    }));

    // Deduplication of loans like in dashboard analytics
    const seenLoanKeys = new Set();
    const deduplicatedLoans = loansNormalized.filter(loan => {
      const key = `${loan.customerId}:${loan.startDate}:${loan.principalAmount}:${loan.status}`;
      if (seenLoanKeys.has(key)) return false;
      seenLoanKeys.add(key);
      return true;
    });

    console.log(`Total Loans Raw: ${loansRaw.length}`);
    console.log(`Total Loans Normalized: ${loansNormalized.length}`);
    console.log(`Total Loans Deduplicated: ${deduplicatedLoans.length}`);

    // Map loans
    const customerIdByLoanId = new Map(deduplicatedLoans.map(loan => [loan.id, loan.customerId]));

    // Group villages by day and shift
    const activeLoans = deduplicatedLoans.filter(l => l.status === "ACTIVE" && customerById.has(l.customerId));
    const pendingAmount = activeLoans.reduce((sum, loan) => sum + (Number(loan.balanceAmount) || 0), 0);

    // Normalize payments
    const paymentsNormalized = paymentsRaw.map(payment => {
      const customerId = payment.customerId || customerIdByLoanId.get(payment.loanId);
      return {
        ...payment,
        paymentDate: toMillis(payment.paymentDate),
        amountPaid: Number(payment.amountPaid || 0),
        customerId
      };
    });

    // Let's filter payments/loans for two scenarios:
    // Scenario A: Filters ONLY active customers (current analytics logic)
    // Scenario B: Includes ALL customers (active or inactive)

    console.log("\n--- CALCULATIONS WITH ACTIVE-ONLY CUSTOMERS FILTER (Scenario A) ---");
    const paymentsA = paymentsNormalized.filter(p => !!p.customerId && customerById.has(p.customerId));
    const regularPaymentsA = paymentsA.filter(p => (p.paymentType || "COLLECTION") !== "DUE");
    const totalCollectionA = regularPaymentsA.reduce((sum, p) => sum + p.amountPaid, 0);

    const loansA = deduplicatedLoans.filter(l => customerById.has(l.customerId));
    const totalDistributedA = loansA.reduce((sum, l) => sum + l.distributedAmount, 0);

    const totalInvestments = investmentsRaw.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const totalExpenses = expensesRaw.reduce((sum, exp) => sum + (exp.amount || 0), 0);

    const netCashPositionA = bfAmount + totalInvestments + totalCollectionA - totalDistributedA - totalExpenses;
    const netPositionA = totalCollectionA - pendingAmount;
    
    console.log(`Total Collection A: ${totalCollectionA}`);
    console.log(`Total Distributed A: ${totalDistributedA}`);
    console.log(`Total Investments: ${totalInvestments}`);
    console.log(`Total Expenses: ${totalExpenses}`);
    console.log(`Balancing Fund override (bfAmount): ${bfAmount}`);
    console.log(`Pending Amount: ${pendingAmount}`);
    console.log(`=> NET CASH POSITION A (Active Only): ${netCashPositionA}`);
    console.log(`=> netPosition (Collection - Pending): ${netPositionA}`);

    console.log("\n--- CALCULATIONS WITH ALL CUSTOMERS FILTER (Scenario B) ---");
    const paymentsB = paymentsNormalized.filter(p => !!p.customerId && customerByIdAll.has(p.customerId));
    const regularPaymentsB = paymentsB.filter(p => (p.paymentType || "COLLECTION") !== "DUE");
    const totalCollectionB = regularPaymentsB.reduce((sum, p) => sum + p.amountPaid, 0);

    const loansB = deduplicatedLoans.filter(l => customerByIdAll.has(l.customerId));
    const totalDistributedB = loansB.reduce((sum, l) => sum + l.distributedAmount, 0);

    const netCashPositionB = bfAmount + totalInvestments + totalCollectionB - totalDistributedB - totalExpenses;

    console.log(`Total Collection B: ${totalCollectionB}`);
    console.log(`Total Distributed B: ${totalDistributedB}`);
    console.log(`=> NET CASH POSITION B (All Customers): ${netCashPositionB}`);

    console.log("\n--- CALCULATIONS WITHOUT ANY CUSTOMER MAP FILTER (Scenario C - Raw sums from DB) ---");
    // Just sum all payments and loans in db for this user
    const paymentsC = paymentsNormalized;
    const regularPaymentsC = paymentsC.filter(p => (p.paymentType || "COLLECTION") !== "DUE");
    const totalCollectionC = regularPaymentsC.reduce((sum, p) => sum + p.amountPaid, 0);
    const totalDistributedC = deduplicatedLoans.reduce((sum, l) => sum + l.distributedAmount, 0);
    const netCashPositionC = bfAmount + totalInvestments + totalCollectionC - totalDistributedC - totalExpenses;

    console.log(`Total Collection C: ${totalCollectionC}`);
    console.log(`Total Distributed C: ${totalDistributedC}`);
    console.log(`=> NET CASH POSITION C (Raw Sums): ${netCashPositionC}`);

    // Let's print out what we get if we don't deduplicate loans
    console.log("\n--- NO LOAN DEDUPLICATION (Scenario D) ---");
    const totalDistributedD = loansNormalized.filter(l => customerById.has(l.customerId)).reduce((sum, l) => sum + l.distributedAmount, 0);
    const netCashPositionD = bfAmount + totalInvestments + totalCollectionA - totalDistributedD - totalExpenses;
    console.log(`Total Distributed D (No Deduplicate, Active only): ${totalDistributedD}`);
    console.log(`=> NET CASH POSITION D: ${netCashPositionD}`);
    
    const totalDistributedE = loansNormalized.filter(l => customerByIdAll.has(l.customerId)).reduce((sum, l) => sum + l.distributedAmount, 0);
    const netCashPositionE = bfAmount + totalInvestments + totalCollectionB - totalDistributedE - totalExpenses;
    console.log(`Total Distributed E (No Deduplicate, All Customers): ${totalDistributedE}`);
    console.log(`=> NET CASH POSITION E: ${netCashPositionE}`);
  }
  process.exit(0);
}

run().catch(console.error);
