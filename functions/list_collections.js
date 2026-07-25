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
  const collections = await db.listCollections();
  console.log("All collections in database:");
  collections.forEach(col => {
    console.log(`- ${col.id}`);
  });
  process.exit(0);
}

run().catch(console.error);
