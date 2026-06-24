const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "service-account-key.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Initialized Firebase Admin using service-account-key.json");
} else {
  // Try default initialization
  admin.initializeApp();
  console.log("Initialized Firebase Admin using Application Default Credentials (or environment default)");
}

const uid = process.argv[2];
if (!uid) {
  console.error("\x1b[31mError: UID is required.\x1b[0m");
  console.log("Usage: node set-collector-claim.js <uid>");
  console.log("Please place your Firebase service account JSON key at 'functions/service-account-key.json' first.");
  process.exit(1);
}

admin.auth().setCustomUserClaims(uid, { role: "collector" })
  .then(() => {
    console.log(`\n\x1b[32mSuccess: 'role: "collector"' claim set for user ${uid}\x1b[0m`);
    return admin.auth().getUser(uid);
  })
  .then((userRecord) => {
    console.log("Updated user record custom claims:", userRecord.customClaims);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\x1b[31mError setting custom claims:\x1b[0m", error);
    process.exit(1);
  });
