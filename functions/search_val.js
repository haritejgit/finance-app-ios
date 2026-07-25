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

async function searchCollection(colName) {
  const snap = await db.collection(colName).get();
  snap.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data);
    if (str.includes("332920") || str.includes("332,920") || str.includes("389450")) {
      console.log(`Match in collection '${colName}', Doc ID: '${doc.id}':`, data);
    }
  });
}

async function run() {
  const collections = ["users", "villages", "customers", "loans", "payments", "investments", "expenses", "balancingFund"];
  for (const col of collections) {
    await searchCollection(col);
  }
  console.log("Search completed.");
  process.exit(0);
}

run().catch(console.error);
