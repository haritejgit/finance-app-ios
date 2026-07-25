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
  const collections = ["users", "villages", "customers", "loans", "payments", "investments", "expenses", "balancingFund"];
  const userIds = new Set();
  
  for (const col of collections) {
    const snap = await db.collection(col).get();
    snap.forEach(doc => {
      const data = doc.data();
      if (data.userId) userIds.add(data.userId);
      // also check if doc ID is a userId
      if (col === "users" || col === "balancingFund") {
        const id = doc.id.split("_")[0];
        userIds.add(id);
      }
    });
  }
  
  console.log("All unique userIds found in database:", Array.from(userIds));
  
  // For each userId, count their documents in each collection
  for (const userId of userIds) {
    console.log(`\n=== Counts for user: ${userId} ===`);
    for (const col of collections) {
      let count = 0;
      const snap = await db.collection(col).get();
      snap.forEach(doc => {
        const data = doc.data();
        if (data.userId === userId) count++;
        else if ((col === "users" || col === "balancingFund") && doc.id.startsWith(userId)) count++;
      });
      console.log(`Collection '${col}': ${count} docs`);
    }
  }
  
  process.exit(0);
}

run().catch(console.error);
