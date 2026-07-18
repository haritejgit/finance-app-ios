import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
// @ts-expect-error - getReactNativePersistence is only resolved/exported in React Native entry points
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function initNativeAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = initNativeAuth();
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});

