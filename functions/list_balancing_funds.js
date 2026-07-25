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
  const snap = await db.collection("balancingFund").get();
  console.log(`balancingFund collection has ${snap.size} documents:`);
  snap.forEach(doc => {
    console.log(`Doc ID: ${doc.id}, data:`, doc.data());
  });
  process.exit(0);
}

run().catch(console.error);
