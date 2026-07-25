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
  const collections = ["loans", "payments", "investments", "expenses"];
  
  for (const col of collections) {
    const snap = await db.collection(col).where("userId", "==", userId).get();
    snap.forEach(doc => {
      const data = doc.data();
      const amt1 = Number(data.amount || 0);
      const amt2 = Number(data.amountPaid || data.amount_paid || 0);
      const amt3 = Number(data.principalAmount || 0);
      
      if (amt1 === 1120 || amt2 === 1120 || amt3 === 1120) {
        console.log(`Match in collection '${col}', Doc ID: '${doc.id}':`, data);
      }
    });
  }
  
  console.log("Search completed.");
  process.exit(0);
}

run().catch(console.error);
