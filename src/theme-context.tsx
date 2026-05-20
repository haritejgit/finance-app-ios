import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, useColorScheme } from "react-native";
import { lightColors, darkColors, type AppColors } from "./theme";

type ColorScheme = "light" | "dark" | "system";

type ThemeContextValue = {
  isDark: boolean;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
  colors: AppColors;
  toggleDarkMode: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = "finance_app_theme";

function getInitialTheme(): ColorScheme {
  if (Platform.OS !== "web" || typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Fall back to system below.
  }
  return "system";
}

function applyWebTheme(isDark: boolean, colors: AppColors) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = isDark ? "dark" : "light";
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`, value);
  });
  root.style.setProperty("--app-bg", colors.background);
  root.style.setProperty("--app-text", colors.text);
  root.style.setProperty("color-scheme", isDark ? "dark" : "light");
  root.style.backgroundColor = colors.background;
  document.body.style.backgroundColor = colors.background;
  document.body.style.color = colors.text;
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", colors.background);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(getInitialTheme);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme) {
          setColorSchemeState(savedTheme as ColorScheme);
        }
      } catch (error) {
        console.error("Failed to load theme:", error);
      }
    };

    loadTheme();
  }, []);

  const isDark =
    colorScheme === "dark" ||
    (colorScheme === "system" && systemColorScheme === "dark");

  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    applyWebTheme(isDark, colors);
  }, [colors, isDark]);

  const setColorScheme = useCallback(async (scheme: ColorScheme) => {
    try {
      setColorSchemeState(scheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, scheme);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.localStorage.setItem(THEME_STORAGE_KEY, scheme);
      }
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  }, []);

  const toggleDarkMode = useCallback(async () => {
    const newScheme: ColorScheme = isDark ? "light" : "dark";
    await setColorScheme(newScheme);
  }, [isDark, setColorScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDark,
      colorScheme,
      setColorScheme,
      colors,
      toggleDarkMode,
    }),
    [colors, colorScheme, isDark, setColorScheme, toggleDarkMode]
  );

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
