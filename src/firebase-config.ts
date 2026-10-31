import { assertFirebaseProjectId } from "./firebase-project-guard";

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length > 0) {
  throw new Error(
    `Missing Firebase configuration: ${missingConfig.join(", ")}. Check EXPO_PUBLIC_FIREBASE_* environment variables.`
  );
}

// Production stays pinned by default. A staging build must explicitly name its target
// in EXPO_PUBLIC_FIREBASE_EXPECTED_PROJECT_ID as well as its Firebase app config.
assertFirebaseProjectId(
  firebaseConfig.projectId,
  process.env.EXPO_PUBLIC_FIREBASE_EXPECTED_PROJECT_ID || "finance-for-ios"
);
