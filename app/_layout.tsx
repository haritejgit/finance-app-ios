import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth-context";
import { ErrorBoundary } from "../src/ErrorBoundary";
import { ThemeProvider, useTheme } from "../src/theme-context";
import Toast from "react-native-toast-message";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootLayoutContent() {
  const { colors } = useTheme();
  const { loading: authLoading } = useAuth();

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
    if (!authLoading) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [authLoading]);

  if (authLoading) return null;
  
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RootLayoutContent />
            <Toast />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
