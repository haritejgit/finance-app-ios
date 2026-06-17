import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, initializeAuth, setPersistence } from "firebase/auth";
import { enableIndexedDbPersistence, getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function initWebAuth() {
  try {
    return initializeAuth(app, { persistence: browserLocalPersistence });
  } catch {
    const auth = getAuth(app);
    void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
    return auth;
  }
}

export const auth = initWebAuth();
export const db = getFirestore(app);

if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch(() => undefined);
}
