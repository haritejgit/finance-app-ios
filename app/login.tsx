import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../src/auth-context";
import { colors, gradient } from "../src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

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

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Finance Manager</Text>
            <Text style={styles.subtitle}>{isSignUp ? "Create your account" : "Login to your account"}</Text>

            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!message && <Text style={styles.success}>{message}</Text>}

            {isSignUp && <TextInput value={name} onChangeText={setName} placeholder="Full Name" style={styles.input} />}
            <TextInput value={email} onChangeText={setEmail} placeholder="Email Address" style={styles.input} autoCapitalize="none" />
            {!forgot && (
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
              />
            )}

            {!isSignUp && !forgot && (
              <Pressable onPress={() => setForgot(true)}>
                <Text style={styles.link}>Forgot Password?</Text>
              </Pressable>
            )}

            <Pressable style={styles.button} onPress={onSubmit} disabled={loading || !email}>
              {loading ? (
                <ActivityIndicator color={colors.blue1} />
              ) : (
                <Text style={styles.buttonText}>{forgot ? "Reset Password" : isSignUp ? "Create Account" : "Login"}</Text>
              )}
            </Pressable>

            {forgot ? (
              <Pressable onPress={() => setForgot(false)}>
                <Text style={styles.switch}>Back to Login</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setSignUp((v) => !v)}>
                <Text style={styles.switch}>{isSignUp ? "Already have an account? Login" : "New User? Create Account"}</Text>
              </Pressable>
            )}

            {!isSignUp && !forgot && (
              <Pressable style={[styles.button, styles.googleBtn]} onPress={() => promptAsync()}>
                <Text style={[styles.buttonText, { color: colors.white }]}>Continue with Google</Text>
              </Pressable>
            )}
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
  container: { paddingHorizontal: 20, paddingVertical: 12, flexGrow: 1, justifyContent: "center" },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 40, 360), alignSelf: "center" },
  title: { fontSize: 28, fontWeight: "700", color: colors.white, textAlign: "center" },
  subtitle: { fontSize: 15, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 20 },
  input: { backgroundColor: colors.white, borderRadius: 14, padding: 14, marginBottom: 12 },
  button: { backgroundColor: colors.white, borderRadius: 28, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: colors.blue1, fontWeight: "700" },
  link: { color: colors.white, alignSelf: "flex-end", marginBottom: 8 },
  switch: { color: colors.white, textAlign: "center", marginTop: 14 },
  googleBtn: { marginTop: 10, backgroundColor: "transparent", borderColor: colors.white, borderWidth: 1 },
  error: { color: "#FFCDD2", marginBottom: 12, textAlign: "center" },
  success: { color: "#C8E6C9", marginBottom: 12, textAlign: "center" },
});
