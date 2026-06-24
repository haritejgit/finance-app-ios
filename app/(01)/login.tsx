import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, TextInput, View, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { useAuth } from "../../src/auth-context";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { colors as baseColors, getGradient } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../src/Icon";
import FinanceMotion from "../../src/FinanceMotion";
import { auth, db } from "../../src/firebase";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, addDoc, where } from "firebase/firestore";
import { signInWithEmailAndPassword as fbSignIn, signOut } from "firebase/auth";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { user, loading: authLoading, signInEmail, signUpEmail, resetPassword, signInGoogleWithIdToken } = useAuth();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setSignUp] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intro = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(0.8)).current;

  // Nested login flow state
  const [nestedStep, setNestedStep] = useState(0); // 0=hidden, 1=signin, 2=master email, 3=otp
  const isNestedFlow = useRef(false);
  const [nestedEmail, setNestedEmail] = useState("");
  const [nestedPassword, setNestedPassword] = useState("");
  const [nestedMasterEmail, setNestedMasterEmail] = useState("");
  const [nestedOtp, setNestedOtp] = useState("");
  const [nestedOtpDocId, setNestedOtpDocId] = useState<string | null>(null);
  const [nestedLoading, setNestedLoading] = useState(false);
  const [nestedError, setNestedError] = useState<string | null>(null);
  const [nestedSuccess, setNestedSuccess] = useState<string | null>(null);
  const [, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_FIREBASE_IOS_GOOGLE_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_FIREBASE_WEB_GOOGLE_CLIENT_ID,
  });

  React.useEffect(() => {
    const run = async () => {
      if (response?.type !== "success") return;
      const idToken = response.params.id_token;
      if (!idToken) return;
      try {
        setLoading(true);
        await signInGoogleWithIdToken(idToken);
        router.replace("/shift-selection");
      } catch (e: any) {
        setError(e?.message ?? "Google sign-in failed");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [response, signInGoogleWithIdToken]);

  useEffect(() => {
    if (!authLoading && user && !isNestedFlow.current) {
      router.replace("/shift-selection");
    }
  }, [authLoading, user]);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [buttonScale, intro]);

  const onSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      if (forgot) {
        await resetPassword(email);
        setMessage("Password reset email sent.");
      } else if (isSignUp) {
        await signUpEmail(name, email, password);
        setMessage("Verification email sent. Verify and then login.");
      } else {
        await signInEmail(email, password);
        router.replace("/shift-selection");
      }
    } catch (e: any) {
      setError(e?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const title = forgot ? "Reset password" : isSignUp ? "Create account" : "Welcome back";

  if (authLoading) {
    return (
      <AnimatedScreen style={styles.root}>
        <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
          <SafeAreaView style={[styles.safe, styles.centered]}>
            <ActivityIndicator color={colors.white} size="large" />
          </SafeAreaView>
        </LinearGradient>
      </AnimatedScreen>
    );
  }

  // ─── Nested Login Flow Handlers ───

  const startNestedLogin = useCallback(() => {
    isNestedFlow.current = true;
    setNestedStep(1);
    setNestedEmail("");
    setNestedPassword("");
    setNestedMasterEmail("");
    setNestedOtp("");
    setNestedError(null);
    setNestedSuccess(null);
  }, []);

  const cancelNestedLogin = useCallback(async () => {
    isNestedFlow.current = false;
    setNestedStep(0);
    setNestedError(null);
    setNestedSuccess(null);
    // If user was signed in during nested flow, sign them out
    if (auth.currentUser) {
      try { await signOut(auth); } catch {}
    }
  }, []);

  const handleNestedStep1 = useCallback(async () => {
    if (!nestedEmail || !nestedPassword) {
      setNestedError("Enter your email and password.");
      return;
    }
    try {
      setNestedLoading(true);
      setNestedError(null);
      await fbSignIn(auth, nestedEmail, nestedPassword);
      setNestedStep(2);
    } catch (e: any) {
      setNestedError(e?.message ?? "Sign-in failed");
    } finally {
      setNestedLoading(false);
    }
  }, [nestedEmail, nestedPassword]);

  const handleNestedStep2 = useCallback(async () => {
    if (!nestedMasterEmail) {
      setNestedError("Enter the main account owner's email.");
      return;
    }
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setNestedError("Session expired. Please start over.");
      return;
    }
    try {
      setNestedLoading(true);
      setNestedError(null);

      // Generate 6-digit OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));

      // Check for master's pending invite
      const pendingSnap = await getDocs(
        query(
          collection(db, "nestedAccounts"),
          where("nestedUserEmail", "==", nestedEmail),
          where("emailPending", "==", true)
        )
      );
      let masterUid: string | null = null;
      if (!pendingSnap.empty) {
        masterUid = pendingSnap.docs[0].data().masterUserId;
      }

      // Create OTP request doc
      const otpDoc = {
        masterEmail: nestedMasterEmail,
        masterUserId: masterUid,
        nestedUserId: currentUid,
        nestedEmail: nestedEmail,
        otp: otp,
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      const otpRef = await addDoc(collection(db, "nestedOtp"), otpDoc);
      setNestedOtpDocId(otpRef.id);
      setNestedStep(3);
      setNestedSuccess("OTP sent! Ask the main account owner to check Admin → Pending OTP Requests for the code.");
    } catch (e: any) {
      setNestedError(e?.message ?? "Failed to request OTP");
    } finally {
      setNestedLoading(false);
    }
  }, [nestedMasterEmail, nestedEmail]);

  const handleNestedStep3 = useCallback(async () => {
    if (!nestedOtp || nestedOtp.length !== 6) {
      setNestedError("Enter the 6-digit OTP code.");
      return;
    }
    if (!nestedOtpDocId) {
      setNestedError("Session expired. Start over.");
      return;
    }
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setNestedError("Session expired. Start over.");
      return;
    }
    try {
      setNestedLoading(true);
      setNestedError(null);
      setNestedSuccess(null);

      // Verify OTP
      const otpSnap = await getDoc(doc(db, "nestedOtp", nestedOtpDocId));
      if (!otpSnap.exists()) {
        setNestedError("OTP request expired. Start over.");
        setNestedLoading(false);
        return;
      }
      const otpData = otpSnap.data();
      if (otpData.status !== "pending") {
        setNestedError("This OTP has already been used or cancelled.");
        setNestedLoading(false);
        return;
      }
      if (Date.now() > otpData.expiresAt) {
        setNestedError("OTP expired (15 min limit). Start over.");
        setNestedLoading(false);
        return;
      }
      if (otpData.otp !== nestedOtp) {
        setNestedError("Wrong OTP. Ask the main account owner for the correct code.");
        setNestedLoading(false);
        return;
      }

      // OTP verified — mark as approved
      await updateDoc(doc(db, "nestedOtp", nestedOtpDocId), {
        status: "approved",
        verifiedAt: Date.now(),
      });

      // Determine master UID
      let resolvedMasterUid = otpData.masterUserId;
      if (!resolvedMasterUid || resolvedMasterUid === "pending") {
        const pendingSnap = await getDocs(
          query(
            collection(db, "nestedAccounts"),
            where("nestedUserEmail", "==", nestedEmail),
            where("emailPending", "==", true)
          )
        );
        if (!pendingSnap.empty) {
          resolvedMasterUid = pendingSnap.docs[0].data().masterUserId;
        }
      }

      if (resolvedMasterUid && resolvedMasterUid !== "pending") {
        // Full link — create nested account mapping
        await setDoc(doc(db, "nestedAccounts", currentUid), {
          id: currentUid,
          masterUserId: resolvedMasterUid,
          nestedUserId: currentUid,
          nestedUserEmail: nestedEmail,
          masterEmail: nestedMasterEmail,
          label: "OTP-approved nested account",
          createdAt: Date.now(),
          otpVerified: true,
          otpDocId: nestedOtpDocId,
        });

        // Clean up pending invites
        const pendingCleanup = await getDocs(
          query(
            collection(db, "nestedAccounts"),
            where("nestedUserEmail", "==", nestedEmail),
            where("emailPending", "==", true)
          )
        );
        pendingCleanup.forEach((d) => deleteDoc(d.ref).catch(() => undefined));

        isNestedFlow.current = false;
        setNestedStep(0);
        setNestedSuccess(null);
        // User is now linked — will auto-redirect to app
        router.replace("/shift-selection");
      } else {
        // No master UID — store with masterEmail, master must approve
        await setDoc(doc(db, "nestedAccounts", currentUid), {
          id: currentUid,
          masterUserId: "unresolved",
          masterEmail: nestedMasterEmail,
          nestedUserId: currentUid,
          nestedUserEmail: nestedEmail,
          label: "OTP-approved (pending master approval)",
          createdAt: Date.now(),
          otpVerified: true,
          otpDocId: nestedOtpDocId,
        });

        // Sign out so the login page shows cleanly
        await signOut(auth);
        isNestedFlow.current = false;
        setNestedStep(0);
        setNestedSuccess(null);
        setMessage(
          "✅ OTP verified! Ask the main account owner to log in and approve your link in Admin → OTP Requests. Then log in again to access the dashboard."
        );
      }
    } catch (e: any) {
      setNestedError(e?.message ?? "OTP verification failed");
    } finally {
      setNestedLoading(false);
    }
  }, [nestedOtp, nestedOtpDocId, nestedEmail, nestedMasterEmail]);

  // ─── Render ───

  return (
    <AnimatedScreen style={styles.root}>
    <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Animated.View
              style={[
                styles.brand,
                {
                  opacity: intro,
                  transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
                },
              ]}
            >
              <View style={styles.motionStage}>
                <FinanceMotion />
                <View style={styles.logo}>
                  <Icon name="wallet" size={30} color={colors.white} />
                </View>
              </View>
              <Text style={styles.title}>Finance Manager</Text>
              <Text style={styles.subtitle}>Fast collections, cleaner reports, better routes.</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
                {
                  opacity: intro,
                  transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
                },
              ]}
            >
              {nestedStep === 0 ? (
                // ─── Normal Login ───
                <>
                  <Text style={[styles.formTitle, { color: colors.text }]}>{title}</Text>
                  <Text style={[styles.formSub, { color: colors.textSecondary }]}>{forgot ? "Enter your email to receive a reset link." : "Sign in to manage your daily finance flow."}</Text>

                  {!!error && <Text style={styles.error}>{error}</Text>}
                  {!!message && <Text style={styles.success}>{message}</Text>}

                  {isSignUp && (
                    <View style={[styles.inputShell, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                      <Icon name="person-outline" size={18} color={colors.gray} />
                      <TextInput value={name} onChangeText={setName} placeholder="Full Name" style={[styles.input, { color: colors.text }]} placeholderTextColor={colors.gray} />
                    </View>
                  )}
                  <View style={[styles.inputShell, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                    <Icon name="mail-outline" size={18} color={colors.gray} />
                    <TextInput value={email} onChangeText={setEmail} placeholder="Email Address" style={[styles.input, { color: colors.text }]} placeholderTextColor={colors.gray} autoCapitalize="none" />
                  </View>
                  {!forgot && (
                    <View style={[styles.inputShell, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                      <Icon name="lock-closed-outline" size={18} color={colors.gray} />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Password"
                        style={[styles.input, { color: colors.text }]}
                        placeholderTextColor={colors.gray}
                        secureTextEntry
                        autoCapitalize="none"
                      />
                    </View>
                  )}

                  {!isSignUp && !forgot && (
                    <Pressable onPress={() => setForgot(true)}>
                      <Text style={[styles.link, { color: colors.primary }]}>Forgot Password?</Text>
                    </Pressable>
                  )}

                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                  <Pressable style={[styles.button, loading || !email ? styles.buttonDisabled : null]} onPress={onSubmit} disabled={loading || !email} accessibilityLabel={forgot ? "Reset password" : isSignUp ? "Create account" : "Login"}>
                    {loading ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>{forgot ? "Reset Password" : isSignUp ? "Create Account" : "Login"}</Text>
                    )}
                  </Pressable>
                  </Animated.View>

                  {forgot ? (
                    <Pressable onPress={() => setForgot(false)}>
                      <Text style={[styles.switch, { color: colors.primary }]}>Back to Login</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => setSignUp((value) => !value)}>
                      <Text style={[styles.switch, { color: colors.primary }]}>{isSignUp ? "Already have an account? Login" : "New User? Create Account"}</Text>
                    </Pressable>
                  )}

                  {!isSignUp && !forgot && (
                    <Pressable style={[styles.googleBtn, { backgroundColor: colors.primarySoft, borderColor: colors.border }]} onPress={() => promptAsync()}>
                      <Icon name="logo-google" size={18} color={colors.blue2} />
                      <Text style={[styles.googleText, { color: colors.primary }]}>Continue with Google</Text>
                    </Pressable>
                  )}

                  {/* Nested Login Divider */}
                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.textSecondary }]}>MORE OPTIONS</Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  </View>

                  <Pressable style={[styles.nestedBtn, { backgroundColor: colors.card, borderColor: colors.primary }]} onPress={startNestedLogin}>
                    <Icon name="people-outline" size={18} color={colors.primary} />
                    <Text style={[styles.nestedBtnText, { color: colors.primary }]}>Nested Account Login</Text>
                  </Pressable>
                </>
              ) : (
                // ─── Nested Login Flow ───
                <>
                  <Text style={[styles.formTitle, { color: colors.text }]}>
                    {nestedStep === 1 ? "Step 1: Sign In" : nestedStep === 2 ? "Step 2: Master's Email" : "Step 3: Enter OTP"}
                  </Text>
                  <Text style={[styles.formSub, { color: colors.textSecondary }]}>
                    {nestedStep === 1
                      ? "Sign in with your own account."
                      : nestedStep === 2
                      ? "Enter the email of the main account owner."
                      : "Ask the main account owner for the 6-digit OTP code."}
                  </Text>

                  {!!nestedError && <Text style={styles.error}>{nestedError}</Text>}
                  {!!nestedSuccess && <Text style={styles.success}>{nestedSuccess}</Text>}

                  {nestedStep === 1 && (
                    <>
                      <View style={[styles.inputShell, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                        <Icon name="mail-outline" size={18} color={colors.gray} />
                        <TextInput value={nestedEmail} onChangeText={setNestedEmail} placeholder="Your Email" style={[styles.input, { color: colors.text }]} placeholderTextColor={colors.gray} autoCapitalize="none" />
                      </View>
                      <View style={[styles.inputShell, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                        <Icon name="lock-closed-outline" size={18} color={colors.gray} />
                        <TextInput value={nestedPassword} onChangeText={setNestedPassword} placeholder="Password" style={[styles.input, { color: colors.text }]} placeholderTextColor={colors.gray} secureTextEntry autoCapitalize="none" />
                      </View>
                      <Pressable style={[styles.button, nestedLoading ? styles.buttonDisabled : null]} onPress={handleNestedStep1} disabled={nestedLoading}>
                        {nestedLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Sign In →</Text>}
                      </Pressable>
                    </>
                  )}

                  {nestedStep === 2 && (
                    <>
                      <View style={[styles.inputShell, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                        <Icon name="person-outline" size={18} color={colors.gray} />
                        <TextInput value={nestedMasterEmail} onChangeText={setNestedMasterEmail} placeholder="Main Account Email" style={[styles.input, { color: colors.text }]} placeholderTextColor={colors.gray} autoCapitalize="none" />
                      </View>
                      <Pressable style={[styles.button, nestedLoading ? styles.buttonDisabled : null]} onPress={handleNestedStep2} disabled={nestedLoading}>
                        {nestedLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Request OTP →</Text>}
                      </Pressable>
                    </>
                  )}

                  {nestedStep === 3 && (
                    <>
                      <View style={[styles.otpRow]}>
                        <TextInput
                          value={nestedOtp}
                          onChangeText={setNestedOtp}
                          placeholder="000000"
                          maxLength={6}
                          style={[styles.otpInput, { color: colors.text, backgroundColor: colors.surfaceTint, borderColor: colors.border }]}
                          keyboardType="number-pad"
                        />
                      </View>
                      <Pressable style={[styles.button, nestedLoading || nestedOtp.length !== 6 ? styles.buttonDisabled : null]} onPress={handleNestedStep3} disabled={nestedLoading || nestedOtp.length !== 6}>
                        {nestedLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Verify & Access</Text>}
                      </Pressable>
                    </>
                  )}

                  <Pressable onPress={cancelNestedLogin}>
                    <Text style={[styles.switch, { color: colors.primary }]}>← Back to Login</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
    </AnimatedScreen>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  container: { paddingHorizontal: 20, paddingVertical: 18, flexGrow: 1, justifyContent: "center" },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 40, 390), alignSelf: "center", gap: 18 },
  brand: { alignItems: "center", gap: 8 },
  motionStage: { width: "100%", height: 150, alignItems: "center", justifyContent: "center" },
  logo: {
    position: "absolute",
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  title: { fontSize: 30, fontWeight: "800", color: baseColors.white, textAlign: "center" },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.78)", textAlign: "center" },
  card: { backgroundColor: baseColors.white, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6 },
  formTitle: { color: baseColors.ink, fontSize: 22, fontWeight: "800" },
  formSub: { color: baseColors.gray, fontSize: 13, lineHeight: 18, marginTop: -6 },
  inputShell: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: baseColors.surfaceTint, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: baseColors.border },
  input: { flex: 1, paddingVertical: 14, color: baseColors.ink, fontSize: 15 },
  button: { backgroundColor: baseColors.coral, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 2 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: baseColors.white, fontWeight: "800", fontSize: 15 },
  link: { color: baseColors.blue2, alignSelf: "flex-end", marginBottom: 2, fontWeight: "700" },
  switch: { color: baseColors.blue2, textAlign: "center", marginTop: 2, fontWeight: "700" },
  googleBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: baseColors.sky, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: "#bfdbfe" },
  googleText: { color: baseColors.blue2, fontWeight: "800" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  nestedBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderStyle: "dashed" },
  nestedBtnText: { fontWeight: "800", fontSize: 14 },
  otpRow: { alignItems: "center", marginVertical: 4 },
  otpInput: { width: "100%", textAlign: "center", fontSize: 28, letterSpacing: 10, fontWeight: "800", borderRadius: 14, paddingVertical: 14, borderWidth: 1 },
  error: { color: "#B91C1C", backgroundColor: "#FEE2E2", borderRadius: 10, padding: 10, textAlign: "center", fontWeight: "600" },
  success: { color: "#047857", backgroundColor: "#D1FAE5", borderRadius: 10, padding: 10, textAlign: "center", fontWeight: "600" },
});
