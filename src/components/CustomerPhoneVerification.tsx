import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, initializeAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut, type ConfirmationResult, type Auth } from "firebase/auth";
import { firebaseConfig } from "../firebase-config";
import { validateIndianPhone } from "../validation";

export type PhoneVerificationDecision = { phone: string; status: "pending" | "verified" | "skipped" };

type Props = {
  phone: string;
  onDecisionChange: (decision: PhoneVerificationDecision) => void;
  colors: { text: string; textMuted: string; card: string; surfaceTint: string; border: string; primary: string; white: string; error: string };
};

type OtpSession = { app: ReturnType<typeof initializeApp>; auth: Auth; verifier: RecaptchaVerifier; confirmation: ConfirmationResult; phone: string; host: HTMLDivElement };

function e164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const error = validateIndianPhone(digits);
  return error ? "" : `+91${digits}`;
}

export function CustomerPhoneVerification({ phone, onDecisionChange, colors }: Props) {
  const normalizedPhone = phone.replace(/\D/g, "").slice(0, 10);
  const [status, setStatus] = useState<PhoneVerificationDecision["status"]>("pending");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<OtpSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sessionRef = useRef<OtpSession | null>(null);
  const latestPhone = useRef(normalizedPhone);
  const callbackRef = useRef(onDecisionChange);
  callbackRef.current = onDecisionChange;

  useEffect(() => {
    latestPhone.current = normalizedPhone;
    setStatus("pending");
    setCode("");
    setMessage("");
    callbackRef.current({ phone: normalizedPhone, status: "pending" });
    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    if (previous) {
      previous.verifier.clear();
      void signOut(previous.auth).catch(() => undefined).finally(() => {
        void deleteApp(previous.app).catch(() => undefined);
        previous.host.remove();
      });
    }
  }, [normalizedPhone]);

  useEffect(() => () => {
    const active = sessionRef.current;
    sessionRef.current = null;
    if (active) {
      active.verifier.clear();
      void signOut(active.auth).catch(() => undefined).finally(() => {
        void deleteApp(active.app).catch(() => undefined);
        active.host.remove();
      });
    }
  }, []);

  const choose = (next: "verified" | "skipped") => {
    setStatus(next);
    setMessage(next === "verified" ? "Phone number verified." : "Continuing without phone verification.");
    callbackRef.current({ phone: normalizedPhone, status: next });
    setCode("");
    const active = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    if (active) {
      active.verifier.clear();
      void signOut(active.auth).catch(() => undefined).finally(() => {
        void deleteApp(active.app).catch(() => undefined);
        active.host.remove();
      });
    }
  };

  const sendCode = async () => {
    const target = e164(normalizedPhone);
    if (!target) { setMessage("Enter a valid 10-digit Indian mobile number to send an OTP."); return; }
    if (Platform.OS !== "web" || typeof document === "undefined") { setMessage("SMS OTP is available in the web app. You can continue without OTP."); return; }
    setBusy(true); setMessage("");
    let app: ReturnType<typeof initializeApp> | null = null;
    let verifier: RecaptchaVerifier | null = null;
    let host: HTMLDivElement | null = null;
    try {
      app = initializeApp(firebaseConfig, `phone-otp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      let auth: Auth;
      try { auth = initializeAuth(app, { persistence: inMemoryPersistence }); }
      catch { auth = getAuth(app); }
      host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.position = "fixed";
      host.style.left = "-10000px";
      host.style.top = "0";
      document.body.appendChild(host);
      verifier = new RecaptchaVerifier(auth, host, { size: "invisible" });
      const confirmation = await signInWithPhoneNumber(auth, target, verifier);
      const created: OtpSession = { app, auth, verifier, confirmation, phone: target, host };
      if (latestPhone.current !== normalizedPhone) {
        verifier.clear(); host.remove(); await deleteApp(app); return;
      }
      sessionRef.current = created;
      setSession(created);
      setStatus("pending");
      callbackRef.current({ phone: normalizedPhone, status: "pending" });
      setMessage(`OTP sent to ${target}.`);
    } catch (error: any) {
      verifier?.clear();
      host?.remove();
      if (app) void deleteApp(app).catch(() => undefined);
      setMessage(error?.code === "auth/invalid-phone-number" ? "That mobile number is invalid." : error?.code === "auth/too-many-requests" ? "Too many OTP attempts. Please wait and try again." : error?.message || "Could not send OTP. Check Firebase Phone sign-in settings and try again.");
    } finally { setBusy(false); }
  };

  const verifyCode = async () => {
    if (!session || code.trim().length !== 6) { setMessage("Enter the 6-digit OTP."); return; }
    setBusy(true); setMessage("");
    try {
      const credential = await session.confirmation.confirm(code.trim());
      if (credential.user.phoneNumber !== session.phone || latestPhone.current !== normalizedPhone) throw new Error("The verified phone number does not match this customer.");
      choose("verified");
    } catch (error: any) {
      setMessage(error?.code === "auth/invalid-verification-code" ? "That OTP is incorrect. Please check it and try again." : error?.message || "Could not verify this OTP.");
    } finally { setBusy(false); }
  };

  return <View style={[styles.card, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
    <Text style={[styles.title, { color: colors.text }]}>Phone verification <Text style={{ color: colors.textMuted, fontWeight: "500" }}>(optional)</Text></Text>
    {status === "verified" ? <Text style={[styles.status, { color: "#16804a" }]}>✓ Phone number verified by OTP</Text> : status === "skipped" ? <Text style={[styles.status, { color: colors.textMuted }]}>Not verified — continuing with the number provided</Text> : <>
      {session ? <View style={styles.row}>
        <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="6-digit OTP" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
        <Pressable disabled={busy} onPress={verifyCode} style={[styles.button, { backgroundColor: colors.primary }]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.buttonText, { color: colors.white }]}>Verify</Text>}</Pressable>
      </View> : <Pressable disabled={busy || !e164(normalizedPhone)} onPress={sendCode} style={[styles.button, { backgroundColor: colors.primary, alignSelf: "flex-start" }, (!e164(normalizedPhone) || busy) && { opacity: 0.55 }]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.buttonText, { color: colors.white }]}>Send OTP</Text>}</Pressable>}
      <Pressable disabled={busy} onPress={() => choose("skipped")} style={styles.skip}><Text style={[styles.skipText, { color: colors.primary }]}>Continue without OTP</Text></Pressable>
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={[styles.message, { color: message.includes("sent") || message.includes("verified") || message.includes("Continuing") ? colors.textMuted : colors.error }]}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { width: "100%", borderWidth: 1, borderRadius: 12, padding: 12, gap: 9 },
  title: { fontSize: 14, fontWeight: "700" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 16 },
  button: { minHeight: 40, borderRadius: 8, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 14, fontWeight: "700" },
  skip: { alignSelf: "flex-start", paddingVertical: 3 },
  skipText: { fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  status: { fontSize: 13, fontWeight: "700" },
  message: { fontSize: 12 },
});
