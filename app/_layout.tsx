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

  useEffect(() => {
    (Text as any).defaultProps = (Text as any).defaultProps || {};
    (Text as any).defaultProps.style = [{ fontFamily: "Onest-Medium" }, (Text as any).defaultProps.style];
    (TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
    (TextInput as any).defaultProps.style = [{ fontFamily: "Onest-Medium" }, (TextInput as any).defaultProps.style];
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <RootLayoutContent />
              <Toast />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
