import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth-context";
import { ThemeProvider, useTheme } from "../src/theme-context";
import { useFonts } from "expo-font";
import Ionicons from "@expo/vector-icons/Ionicons";

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
  const [loaded, error] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RootLayoutContent />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
