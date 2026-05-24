import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth-context";
import { ErrorBoundary } from "../src/ErrorBoundary";
import { ThemeProvider, useTheme } from "../src/theme-context";
import Toast from "react-native-toast-message";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootLayoutContent() {
  const { colors } = useTheme();
  
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
