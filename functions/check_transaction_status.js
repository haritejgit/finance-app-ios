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
  const txnId = "wPx8wNgFvPMynF1XK2NE";
  const docSnap = await db.collection("nestedTransactions").doc(txnId).get();
  if (docSnap.exists) {
    console.log("Transaction details:", JSON.stringify(docSnap.data(), null, 2));
  } else {
    console.log("Transaction does not exist (may have been deleted or never existed under this ID).");
  }
  process.exit(0);
}

run().catch(console.error);
