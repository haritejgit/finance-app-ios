import "./global.css";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth-context";
import { ErrorBoundary } from "../src/ErrorBoundary";
import { ThemeProvider, useTheme } from "../src/theme-context";
import Toast from "react-native-toast-message";
import { LanguageProvider } from "../src/language-context";
import { ReducedMotionProvider } from "../src/useReducedMotion";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootLayoutContent() {
  const { colors } = useTheme();
  const { loading: authLoading } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handleTransientNetworkError = (event: PromiseRejectionEvent) => {
      const message = String(event.reason?.message ?? event.reason ?? "");
      if (message.includes("NetworkError: A network error occurred")) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleTransientNetworkError);
    return () => window.removeEventListener("unhandledrejection", handleTransientNetworkError);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        if (sessionStorage.getItem("sw_cleaned_v1")) return;
      } catch {}
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (!registrations || registrations.length === 0) return;
        let unregisteredCount = 0;
        Promise.all(
          registrations.map((reg) =>
            reg.unregister().then((ok) => {
              if (ok) unregisteredCount++;
            })
          )
        ).then(() => {
          if (unregisteredCount > 0) {
            try {
              sessionStorage.setItem("sw_cleaned_v1", "true");
            } catch {}
            if (typeof caches !== "undefined") {
              caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => {
                window.location.reload();
              });
            } else {
              window.location.reload();
            }
          }
        });
      });
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [authLoading]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (!state.isConnected) {
        setIsOffline(true);
        return;
      }
      reconnectTimer.current = setTimeout(() => setIsOffline(false), 2000);
    });
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      unsub();
    };
  }, []);

  if (authLoading) return null;
  
  return (
    <>
      {isOffline && (
        <View style={{ backgroundColor: "#FF9800", paddingVertical: 6, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
            You are offline - data may not be current
          </Text>
        </View>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "Onest-Regular": require("../assets/fonts/Onest-Regular.ttf"),
    "Onest-Medium": require("../assets/fonts/Onest-Medium.ttf"),
    "Onest-SemiBold": require("../assets/fonts/Onest-SemiBold.ttf"),
    "Onest-Bold": require("../assets/fonts/Onest-Bold.ttf"),
  });
  const [fontTimeoutPassed, setFontTimeoutPassed] = useState(false);

  useEffect(() => {
    // Prevent indefinite splash hang if fonts take longer than 800ms
    const timer = setTimeout(() => setFontTimeoutPassed(true), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontsLoaded || Platform.OS === "web") {
      (Text as any).defaultProps = (Text as any).defaultProps || {};
      (Text as any).defaultProps.style = [{ fontFamily: "Onest-Medium" }, (Text as any).defaultProps.style];
      (TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
      (TextInput as any).defaultProps.style = [{ fontFamily: "Onest-Medium" }, (TextInput as any).defaultProps.style];
    }
  }, [fontsLoaded]);

  if (!fontsLoaded && Platform.OS !== "web" && !fontTimeoutPassed) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <ReducedMotionProvider>
              <AuthProvider>
                <RootLayoutContent />
                <Toast />
              </AuthProvider>
            </ReducedMotionProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
