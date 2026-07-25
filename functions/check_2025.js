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
  const limitDate = 1767225600000; // Jan 1, 2026
  
  const collections = ["loans", "payments", "investments", "expenses"];
  
  for (const col of collections) {
    const snap = await db.collection(col).where("userId", "==", userId).get();
    let beforeCount = 0;
    let beforeSum = 0;
    
    snap.forEach(doc => {
      const data = doc.data();
      const rawDate = data.date ?? data.paymentDate ?? data.payment_date ?? data.startDate ?? data.start_date ?? data.createdAt;
      const dateVal = toMillis(rawDate);
      if (dateVal === 0) {
        beforeCount++;
        const amt = Number(data.amount || data.amountPaid || data.amount_paid || 0);
        beforeSum += amt;
        if (beforeCount <= 5) {
          console.log(`  [Invalid Date] Doc ID: ${doc.id}, rawDate:`, rawDate);
        }
      }
    });
    
    console.log(`Collection '${col}': ${beforeCount} documents failed to parse/are 0 (Total sum: ${beforeSum})`);
  }
  
  process.exit(0);
}

run().catch(console.error);
