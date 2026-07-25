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

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";
  const openingDate = 1767225600000; // Jan 1, 2026
  
  const [loansSnap, paymentsSnap, investmentsSnap, expensesSnap] = await Promise.all([
    db.collection("loans").where("userId", "==", userId).get(),
    db.collection("payments").where("userId", "==", userId).get(),
    db.collection("investments").where("userId", "==", userId).get(),
    db.collection("expenses").where("userId", "==", userId).get(),
  ]);

  console.log("=== EXCLUSIONS ANALYSIS ===");

  const checkExclusions = (name, snap, dateField) => {
    let excludedCount = 0;
    snap.forEach(doc => {
      const data = doc.data();
      const rawDate = data[dateField] || data.date || data.createdAt;
      const ts = toMillis(rawDate);
      if (ts < openingDate) {
        excludedCount++;
        if (excludedCount <= 3) {
          console.log(`Excluded ${name} - ID: ${doc.id}, rawDate: ${rawDate}, ts: ${ts} (${new Date(ts).toISOString()})`);
        }
      }
    });
    console.log(`Total excluded ${name}: ${excludedCount} / ${snap.size}`);
  };

  checkExclusions("Loan", loansSnap, "startDate");
  checkExclusions("Payment", paymentsSnap, "paymentDate");
  checkExclusions("Investment", investmentsSnap, "date");
  checkExclusions("Expense", expensesSnap, "date");

  process.exit(0);
}

run().catch(console.error);
