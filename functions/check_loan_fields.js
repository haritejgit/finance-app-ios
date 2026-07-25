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
  
  let missingStartDate = 0;
  
  snap.forEach(doc => {
    const data = doc.data();
    if (data.startDate === undefined) {
      missingStartDate++;
      if (missingStartDate <= 5) {
        console.log(`Loan ID: ${doc.id} is missing startDate. Keys:`, Object.keys(data));
      }
    }
  });
  
  console.log(`Total loans missing startDate: ${missingStartDate} / ${snap.size}`);
  process.exit(0);
}

run().catch(console.error);
