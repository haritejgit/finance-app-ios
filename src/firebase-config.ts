const PRODUCTION_FIREBASE_PROJECT_ID = "finance-for-ios";

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

// A release must never silently connect to an empty or unrelated project.
if (firebaseConfig.projectId !== PRODUCTION_FIREBASE_PROJECT_ID) {
  throw new Error(
    `Firebase project must be ${PRODUCTION_FIREBASE_PROJECT_ID}; received ${firebaseConfig.projectId ?? "none"}.`
  );
}
