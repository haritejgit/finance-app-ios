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
  const usersSnap = await db.collection("users").get();
  console.log(`=== users collection (${usersSnap.size} docs) ===`);
  usersSnap.forEach(doc => {
    console.log(`Doc ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}

run().catch(console.error);
