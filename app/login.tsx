import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import { Dimensions, StyleSheet, Text, TextInput, View, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { useAuth } from "../src/auth-context";
import { colors, gradient } from "../src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../src/Icon";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signInEmail, signUpEmail, resetPassword, signInGoogleWithIdToken } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setSignUp] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={styles.brand}>
              <View style={styles.logo}>
                <Icon name="wallet" size={30} color={colors.white} />
              </View>
              <Text style={styles.title}>Finance Manager</Text>
              <Text style={styles.subtitle}>Fast collections, cleaner reports, better routes.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.formTitle}>{title}</Text>
              <Text style={styles.formSub}>{forgot ? "Enter your email to receive a reset link." : "Sign in to manage your daily finance flow."}</Text>

              {!!error && <Text style={styles.error}>{error}</Text>}
              {!!message && <Text style={styles.success}>{message}</Text>}

              {isSignUp && (
                <View style={styles.inputShell}>
                  <Icon name="person-outline" size={18} color={colors.gray} />
                  <TextInput value={name} onChangeText={setName} placeholder="Full Name" style={styles.input} placeholderTextColor={colors.gray} />
                </View>
              )}
              <View style={styles.inputShell}>
                <Icon name="mail-outline" size={18} color={colors.gray} />
                <TextInput value={email} onChangeText={setEmail} placeholder="Email Address" style={styles.input} placeholderTextColor={colors.gray} autoCapitalize="none" />
              </View>
              {!forgot && (
                <View style={styles.inputShell}>
                  <Icon name="lock-closed-outline" size={18} color={colors.gray} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    style={styles.input}
                    placeholderTextColor={colors.gray}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
              )}

              {!isSignUp && !forgot && (
                <Pressable onPress={() => setForgot(true)}>
                  <Text style={styles.link}>Forgot Password?</Text>
                </Pressable>
              )}

              <Pressable style={[styles.button, loading || !email ? styles.buttonDisabled : null]} onPress={onSubmit} disabled={loading || !email}>
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>{forgot ? "Reset Password" : isSignUp ? "Create Account" : "Login"}</Text>
                )}
              </Pressable>

              {forgot ? (
                <Pressable onPress={() => setForgot(false)}>
                  <Text style={styles.switch}>Back to Login</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => setSignUp((value) => !value)}>
                  <Text style={styles.switch}>{isSignUp ? "Already have an account? Login" : "New User? Create Account"}</Text>
                </Pressable>
              )}

              {!isSignUp && !forgot && (
                <Pressable style={styles.googleBtn} onPress={() => promptAsync()}>
                  <Icon name="logo-google" size={18} color={colors.blue2} />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { paddingHorizontal: 20, paddingVertical: 18, flexGrow: 1, justifyContent: "center" },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 40, 390), alignSelf: "center", gap: 18 },
  brand: { alignItems: "center", gap: 8 },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  title: { fontSize: 30, fontWeight: "800", color: colors.white, textAlign: "center" },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.78)", textAlign: "center" },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 18, gap: 12, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6 },
  formTitle: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  formSub: { color: colors.gray, fontSize: 13, lineHeight: 18, marginTop: -6 },
  inputShell: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceTint, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, paddingVertical: 14, color: colors.ink, fontSize: 15 },
  button: { backgroundColor: colors.coral, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 2 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  link: { color: colors.blue2, alignSelf: "flex-end", marginBottom: 2, fontWeight: "700" },
  switch: { color: colors.blue2, textAlign: "center", marginTop: 2, fontWeight: "700" },
  googleBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: colors.sky, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: "#bfdbfe" },
  googleText: { color: colors.blue2, fontWeight: "800" },
  error: { color: "#B91C1C", backgroundColor: "#FEE2E2", borderRadius: 10, padding: 10, textAlign: "center", fontWeight: "600" },
  success: { color: "#047857", backgroundColor: "#D1FAE5", borderRadius: 10, padding: 10, textAlign: "center", fontWeight: "600" },
});
