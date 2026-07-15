import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  signInWithCredential,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

type AuthUserProfile = {
  role: "owner" | "nested";
  parentUid: string | null;
  active?: boolean;
  email?: string;
};

type AuthContextValue = {
  user: User | null;
  userProfile: AuthUserProfile | null;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signInGoogleWithIdToken: (idToken: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<AuthUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const handleProfileLoading = async (uid: string, email: string) => {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.role === "nested" && data.active === false) {
          return { shouldSignOut: true, profile: null };
        }
        return {
          shouldSignOut: false,
          profile: {
            role: (data.role || "owner") as "owner" | "nested",
            parentUid: data.parentUid || null,
            active: data.active !== false,
            email: data.email || email || "",
          }
        };
      } else {
        // Fallback for pre-existing nested accounts without users/{uid} document
        const nestedSnap = await getDoc(doc(db, "nestedAccounts", uid));
        if (nestedSnap.exists()) {
          const nestedData = nestedSnap.data();
          if (nestedData.active === false) {
            return { shouldSignOut: true, profile: null };
          }
          const parentUid = nestedData.masterUserId || nestedData.ownerUid || null;
          // Auto-heal users collection
          try {
            const { setDoc, doc: docRef } = await import("firebase/firestore");
            await setDoc(docRef(db, "users", uid), {
              id: uid,
              userId: uid,
              role: "nested",
              parentUid: parentUid,
              active: nestedData.active !== false,
              email: nestedData.nestedEmail || email || "",
              name: nestedData.label || "Vacation Cover",
              createdAt: nestedData.createdAt || Date.now()
            });
          } catch (err) {
            console.error("Auto-heal users document failed:", err);
          }
          return {
            shouldSignOut: false,
            profile: {
              role: "nested" as const,
              parentUid: parentUid,
              active: nestedData.active !== false,
              email: nestedData.nestedEmail || email || "",
            }
          };
        }
        return {
          shouldSignOut: false,
          profile: { role: "owner" as const, parentUid: null, active: true }
        };
      }
    };

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      if (nextUser) {
        try {
          const res = await handleProfileLoading(nextUser.uid, nextUser.email || "");
          if (res.shouldSignOut) {
            await signOut(auth);
            if (active) {
              setUser(null);
              setUserProfile(null);
              setLoading(false);
            }
            return;
          }
          if (active) {
            setUserProfile(res.profile);
          }
        } catch (e) {
          console.error("Error loading user profile", e);
          if (active) {
            setUserProfile({ role: "owner", parentUid: null, active: true });
          }
        }
      } else {
        if (active) setUserProfile(null);
      }
      if (active) {
        setUser(nextUser);
        setLoading(false);
      }
    });

    void auth.authStateReady().then(async () => {
      if (!active) return;
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const res = await handleProfileLoading(currentUser.uid, currentUser.email || "");
          if (res.shouldSignOut) {
            await signOut(auth);
            if (active) {
              setUser(null);
              setUserProfile(null);
              setLoading(false);
            }
            return;
          }
          if (active) {
            setUserProfile(res.profile);
          }
        } catch (e) {
          console.error("Error loading user profile in authReady", e);
          if (active) {
            setUserProfile({ role: "owner", parentUid: null, active: true });
          }
        }
      }
      if (active) {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userProfile,
      loading,
      async signInEmail(email, password) {
        const result = await signInWithEmailAndPassword(auth, email, password);
        try {
          const snap = await getDoc(doc(db, "users", result.user.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data.role === "nested") {
              if (data.active === false) {
                await signOut(auth);
                throw new Error("This nested account has been deactivated.");
              }
              return;
            }
          }
        } catch (e: any) {
          if (e.message && e.message.includes("deactivated")) {
            throw e;
          }
        }

        if (!result.user.emailVerified) {
          await signOut(auth);
          throw new Error("Please verify your email before signing in.");
        }
      },
      async signInGoogleWithIdToken(idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      },
      async signUpEmail(name, email, password) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
        await sendEmailVerification(result.user);
      },
      resetPassword(email) {
        return sendPasswordResetEmail(auth, email);
      },
      logout() {
        return signOut(auth);
      },
    }),
    [loading, user, userProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
