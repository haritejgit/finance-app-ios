import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, initializeAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut, type ConfirmationResult, type Auth } from "firebase/auth";
import { firebaseConfig } from "../firebase-config";
import { validateIndianPhone } from "../validation";
import { formatLoanOtpMessage } from "../otp-format";
import Icon from "../Icon";

export type PhoneVerificationDecision = { phone: string; status: "pending" | "verified" | "skipped" };

type Props = {
  phone: string;
  onDecisionChange: (decision: PhoneVerificationDecision) => void;
  colors: {
    text: string;
    textMuted: string;
    textSecondary: string;
    card: string;
    surfaceTint: string;
    border: string;
    primary: string;
    primarySoft: string;
    warningSoft: string;
    successSoft: string;
    white: string;
    error: string;
  };
  loanAmount?: number | string;
  customerName?: string;
  purpose?: "new_loan" | "renewal";
};

type OtpSession = { app: ReturnType<typeof initializeApp>; auth: Auth; verifier: RecaptchaVerifier; confirmation: ConfirmationResult; phone: string; host: HTMLDivElement };

function e164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const error = validateIndianPhone(digits);
  return error ? "" : `+91${digits}`;
}

export function CustomerPhoneVerification({ phone, onDecisionChange, colors, loanAmount, customerName, purpose = "new_loan" }: Props) {
  const normalizedPhone = phone.replace(/\D/g, "").slice(0, 10);
  const [status, setStatus] = useState<PhoneVerificationDecision["status"]>("pending");
  const [code, setCode] = useState("");
  const [activeOtpCode, setActiveOtpCode] = useState<string>("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);
  const [session, setSession] = useState<OtpSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const sessionRef = useRef<OtpSession | null>(null);
  const latestPhone = useRef(normalizedPhone);
  const callbackRef = useRef(onDecisionChange);
  callbackRef.current = onDecisionChange;

  const parsedAmount = typeof loanAmount === "number" ? loanAmount : parseFloat(String(loanAmount || "").replace(/,/g, ""));
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const { promptText, customerMessage, shareMessage } = formatLoanOtpMessage({
    loanAmount,
    customerName,
    purpose,
    otpCode: activeOtpCode || undefined,
  });

  useEffect(() => {
    latestPhone.current = normalizedPhone;
    setStatus("pending");
    setCode("");
    setActiveOtpCode("");
    setOtpExpiresAt(0);
    setMessage("");
    setCopied(false);
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
    setMessage(next === "verified" ? "Phone number & loan approval verified." : "Continuing without phone verification.");
    callbackRef.current({ phone: normalizedPhone, status: next });
    setCode("");
    setActiveOtpCode("");
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

  const generateAndDispatchOtp = async (channel?: "whatsapp" | "sms") => {
    const target = e164(normalizedPhone);
    if (!target) {
      setMessage("Enter a valid 10-digit Indian mobile number to send an OTP.");
      return;
    }
    if (!hasValidAmount) {
      setMessage("Please enter the loan amount above first so it is included in the OTP message.");
      return;
    }

    // Generate a secure 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setActiveOtpCode(generatedOtp);
    setOtpExpiresAt(Date.now() + 10 * 60 * 1000);
    setStatus("pending");
    callbackRef.current({ phone: normalizedPhone, status: "pending" });

    const msgWithOtp = formatLoanOtpMessage({
      loanAmount,
      customerName,
      purpose,
      otpCode: generatedOtp,
    }).customerMessage;

    if (channel === "whatsapp") {
      const waUrl = `https://wa.me/91${normalizedPhone}?text=${encodeURIComponent(msgWithOtp)}`;
      Linking.openURL(waUrl).catch(() => undefined);
      setMessage(`OTP sent to WhatsApp (+91 ${normalizedPhone}).`);
      return;
    }

    if (channel === "sms") {
      const smsSep = Platform.OS === "ios" ? "&" : "?";
      const smsUrl = `sms:+91${normalizedPhone}${smsSep}body=${encodeURIComponent(msgWithOtp)}`;
      Linking.openURL(smsUrl).catch(() => undefined);
      setMessage(`OTP opened in SMS (+91 ${normalizedPhone}).`);
      return;
    }

    // Default: also trigger Firebase Phone Auth if in web
    if (Platform.OS === "web" && typeof document !== "undefined") {
      setBusy(true);
      setMessage("");
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
        setMessage(`OTP dispatched to ${target}. Share with customer via WhatsApp/SMS if needed.`);
      } catch (error: any) {
        verifier?.clear();
        host?.remove();
        if (app) void deleteApp(app).catch(() => undefined);
        setMessage(
          error?.code === "auth/invalid-phone-number"
            ? "That mobile number is invalid."
            : error?.code === "auth/too-many-requests"
            ? "Too many automated attempts. You can still send via WhatsApp or SMS button below."
            : `OTP generated. Share directly with customer via WhatsApp or SMS.`
        );
      } finally {
        setBusy(false);
      }
    } else {
      setMessage(`OTP ${generatedOtp} generated. Share via WhatsApp or SMS.`);
    }
  };

  const verifyCode = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setMessage("Enter the 6-digit OTP.");
      return;
    }

    // 1. Check local OTP first (from WhatsApp / SMS / direct dispatch)
    if (activeOtpCode && trimmed === activeOtpCode) {
      if (Date.now() > otpExpiresAt) {
        setMessage("This OTP has expired. Please send a new OTP.");
        return;
      }
      choose("verified");
      return;
    }

    // 2. Check Firebase session confirmation
    if (session) {
      setBusy(true);
      setMessage("");
      try {
        const credential = await session.confirmation.confirm(trimmed);
        if (credential.user.phoneNumber !== session.phone || latestPhone.current !== normalizedPhone) {
          throw new Error("The verified phone number does not match this customer.");
        }
        choose("verified");
        return;
      } catch (error: any) {
        setMessage(
          error?.code === "auth/invalid-verification-code"
            ? "That OTP is incorrect. Please check it and try again."
            : error?.message || "Could not verify this OTP."
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    setMessage("That OTP is incorrect. Please check it and try again.");
  };

  const copyToClipboard = () => {
    const textToCopy = customerMessage;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).catch(() => undefined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const isOtpActive = !!activeOtpCode || !!session;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.iconBadge, { backgroundColor: colors.primarySoft }]}>
          <Icon name="shield-checkmark-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Customer Confirmation OTP</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Verify customer consent for loan approval
          </Text>
        </View>
        <View style={[styles.optionalBadge, { backgroundColor: colors.warningSoft }]}>
          <Text style={[styles.optionalText, { color: colors.text }]}>OPTIONAL</Text>
        </View>
      </View>

      {!hasValidAmount ? (
        <View style={[styles.warningBanner, { backgroundColor: colors.warningSoft }]}>
          <Icon name="alert-circle-outline" size={16} color="#B45309" />
          <Text style={[styles.warningBannerText, { color: colors.text }]}>
            Please enter the loan amount above so it is included in the OTP message.
          </Text>
        </View>
      ) : null}

      <View style={[styles.noticeCard, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
        <View style={styles.noticeHeader}>
          <Icon name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
          <Text style={[styles.noticeTitle, { color: colors.text }]}>
            {activeOtpCode ? "Message Sent to Customer (with OTP)" : "Confirmation Message for Customer"}
          </Text>
          {activeOtpCode ? (
            <Pressable onPress={copyToClipboard} style={styles.copyBtn}>
              <Text style={[styles.copyBtnText, { color: colors.primary }]}>{copied ? "Copied!" : "Copy"}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.noticeQuote, { color: colors.textSecondary }]}>
          "{customerMessage}"
        </Text>
      </View>

      {status === "verified" ? (
        <View style={[styles.statusBox, { backgroundColor: colors.successSoft }]}>
          <Icon name="checkmark-circle" size={18} color="#16804a" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.status, { color: "#16804a" }]}>Phone & loan approval confirmed</Text>
            <Text style={[styles.statusSub, { color: "#16804a" }]}>{promptText}</Text>
          </View>
        </View>
      ) : status === "skipped" ? (
        <View style={[styles.statusBox, { backgroundColor: colors.surfaceTint }]}>
          <Icon name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.status, { color: colors.textMuted }]}>Continuing without OTP verification</Text>
        </View>
      ) : (
        <>
          {isOtpActive ? (
            <View style={styles.row}>
              <TextInput
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceTint, borderColor: colors.border }]}
              />
              <Pressable
                disabled={busy}
                onPress={verifyCode}
                style={[styles.button, styles.verifyButton, { backgroundColor: colors.primary }]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Icon name="checkmark" size={17} color={colors.white} />
                    <Text style={[styles.buttonText, { color: colors.white }]}>Verify OTP</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}

          <View style={styles.actions}>
            {!isOtpActive ? (
              <Pressable
                disabled={busy || !e164(normalizedPhone)}
                onPress={() => generateAndDispatchOtp()}
                style={[
                  styles.button,
                  styles.sendButton,
                  { backgroundColor: colors.primary },
                  (!e164(normalizedPhone) || busy) && { opacity: 0.55 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Icon name="chatbubble-ellipses-outline" size={16} color={colors.white} />
                    <Text style={[styles.buttonText, { color: colors.white }]}>Send OTP</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                disabled={busy}
                onPress={() => generateAndDispatchOtp()}
                style={[styles.button, styles.resendButton, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}
              >
                <Icon name="refresh-outline" size={15} color={colors.textSecondary} />
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Resend</Text>
              </Pressable>
            )}

            {e164(normalizedPhone) ? (
              <>
                <Pressable
                  onPress={() => generateAndDispatchOtp("whatsapp")}
                  style={[styles.button, styles.whatsAppButton]}
                >
                  <Icon name="logo-whatsapp" size={16} color="#ffffff" />
                  <Text style={[styles.buttonText, { color: "#ffffff" }]}>WhatsApp OTP</Text>
                </Pressable>

                <Pressable
                  onPress={() => generateAndDispatchOtp("sms")}
                  style={[styles.button, styles.smsButton, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}
                >
                  <Icon name="mail-outline" size={15} color={colors.textSecondary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>SMS OTP</Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              disabled={busy}
              onPress={() => choose("skipped")}
              style={[styles.skipButton, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}
            >
              <Text style={[styles.skipText, { color: colors.textSecondary }]} numberOfLines={2}>
                Skip OTP
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.message,
            {
              color:
                message.includes("sent") || message.includes("verified") || message.includes("generated") || message.includes("dispatched") || message.includes("opened")
                  ? colors.textMuted
                  : colors.error,
            },
          ]}
        >
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    gap: 12,
    shadowColor: "#12294A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.045,
    shadowRadius: 7,
    elevation: 1,
  },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBadge: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14, fontWeight: "800" },
  subtitle: { fontSize: 11, fontWeight: "500" },
  optionalBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  optionalText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  warningBannerText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  noticeTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flex: 1,
  },
  copyBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  noticeQuote: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    fontStyle: "italic",
  },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 16,
  },
  actions: { flexDirection: "row", alignItems: "stretch", gap: 8, flexWrap: "wrap" },
  button: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: { flex: 2, minWidth: 110 },
  resendButton: { borderWidth: 1, paddingHorizontal: 10 },
  whatsAppButton: {
    backgroundColor: "#25D366",
    paddingHorizontal: 11,
  },
  smsButton: {
    borderWidth: 1,
    paddingHorizontal: 11,
  },
  verifyButton: { minWidth: 105 },
  buttonText: { fontSize: 13, fontWeight: "800" },
  secondaryButtonText: { fontSize: 12, fontWeight: "700" },
  skipButton: {
    flex: 1,
    minWidth: 75,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  statusBox: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  status: { fontSize: 12, fontWeight: "700" },
  statusSub: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  message: { fontSize: 11, lineHeight: 16 },
});
