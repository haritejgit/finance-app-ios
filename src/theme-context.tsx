import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import { lightColors, darkColors } from "./theme";

type ColorScheme = "light" | "dark" | "system";

type ThemeContextValue = {
  isDark: boolean;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
  colors: typeof lightColors;
  toggleDarkMode: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = "finance_app_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("system");
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme) {
          setColorSchemeState(savedTheme as ColorScheme);
        }
      } catch (error) {
        console.error("Failed to load theme:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, []);

  // Determine if dark mode is active
  const isDark =
    colorScheme === "dark" ||
    (colorScheme === "system" && systemColorScheme === "dark");

  const colors = isDark ? darkColors : lightColors;

  const setColorScheme = async (scheme: ColorScheme) => {
    try {
      setColorSchemeState(scheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, scheme);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  };

  const toggleDarkMode = async () => {
    const newScheme: ColorScheme = isDark ? "light" : "dark";
    await setColorScheme(newScheme);
  };

  if (isLoading) {
    return null;
  }

  const value: ThemeContextValue = {
    isDark,
    colorScheme,
    setColorScheme,
    colors,
    toggleDarkMode,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function useColors() {
  const { colors } = useTheme();
  return colors;
}
