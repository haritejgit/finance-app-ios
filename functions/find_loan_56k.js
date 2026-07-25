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

async function run() {
  const userId = "pVysC9oDOfeE26aGETPMkstYhX22";
  const snap = await db.collection("loans").where("userId", "==", userId).get();
  console.log(`Found ${snap.size} loans.`);
  
  snap.forEach(doc => {
    const data = doc.data();
    const principal = Number(data.principalAmount || data.amount || 0);
    const deduction = Math.floor(principal / 1000) * 20;
    if (principal === 56000 || deduction === 1120) {
      console.log(`Matching Loan - Doc ID: ${doc.id}, data:`, data);
    }
  });
  
  process.exit(0);
}

run().catch(console.error);
