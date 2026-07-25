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
  const logsSnap = await db.collection("debugLogs")
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();

  console.log(`=== Reconcile Debug Logs ===`);
  let count = 0;
  logsSnap.forEach(doc => {
    const data = doc.data();
    if (data.message && data.message.includes("reconcile") && count < 10) {
      console.log(`\nDoc ID: ${doc.id}`);
      console.log(JSON.stringify(data, null, 2));
      count++;
    }
  });
  process.exit(0);
}

run().catch(console.error);
