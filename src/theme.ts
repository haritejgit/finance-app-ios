export const lightColors = {
  blue1: "#17152F",
  blue2: "#6C63FF",
  blue3: "#00D4AA",
  teal: "#00D4AA",
  indigo: "#6C63FF",
  coral: "#FFB347",
  mint: "#103D38",
  sky: "#24244A",

  white: "#FFFFFF",
  gray: "#A0A0B0",
  grayLight: "#2A2A3E",
  grayLighter: "#121220",
  ink: "#FFFFFF",
  surface: "#1A1A2E",
  surfaceTint: "#222238",

  paidGreen: "#00D4AA",
  missedRed: "#FF6B6B",
  amber: "#FFB347",

  success: "#00D4AA",
  warning: "#FFB347",
  error: "#FF6B6B",
  info: "#6C63FF",

  text: "#FFFFFF",
  textSecondary: "#A0A0B0",
  textMuted: "#77778A",
  background: "#0F0F1A",
  backgroundSecondary: "#15152A",
  border: "#2A2A3E",

  card: "#1A1A2E",
  cardElevated: "#222238",
  primary: "#6C63FF",
  primarySoft: "#292659",
  overlay: "rgba(0,0,0,0.68)",
  glass: "rgba(26,26,46,0.76)",
  glassBorder: "rgba(255,255,255,0.12)",
  chartGrid: "#2A2A3E",
  focusRing: "#6C63FF",
  destructiveSoft: "#3A202C",
  successSoft: "#103D38",
  warningSoft: "#3C2D1A",
};

export const darkColors: typeof lightColors = { ...lightColors };

export type AppColors = typeof lightColors;

export const colors = darkColors;

export const gradient = [colors.blue1, colors.blue2, colors.blue3] as const;

export function getGradient(themeColors: AppColors) {
  return [themeColors.blue1, themeColors.blue2, themeColors.blue3] as const;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
};
