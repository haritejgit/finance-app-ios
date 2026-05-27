export const Colors = {
  bg: "#0A0E1A",
  bgCard: "#1A1A2E",
  bgCardAlt: "#16213E",
  primary: "#1565C0",
  primaryLight: "#1976D2",
  primaryGradient: ["#1565C0", "#0D47A1"] as const,
  accent: "#00C896",
  warning: "#FF9800",
  danger: "#EF5350",
  gold: "#FFD700",
  textPrimary: "#FFFFFF",
  textSecondary: "#B0BEC5",
  textMuted: "#607D8B",
  border: "#1E2D3D",
  success: "#00C896",
  cardShadow: "#000000",
};

export const Gradients = {
  screenBg: ["#0A0E1A", "#0D1B2A"] as const,
  header: ["#1A1A2E", "#16213E"] as const,
  collectedCard: ["#1565C0", "#0D47A1", "#1976D2"] as const,
  startButton: ["#FF6B35", "#F7451A"] as const,
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const Radius = { sm: 8, md: 12, lg: 16, xl: 24 };
export const FontSize = { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 };

export const lightColors = {
  blue1: Colors.bg,
  blue2: Colors.primary,
  blue3: "#0D1B2A",
  teal: Colors.accent,
  indigo: Colors.primaryLight,
  coral: "#FF6B35",
  mint: "#0E3B35",
  sky: Colors.bgCardAlt,

  white: "#FFFFFF",
  gray: Colors.textSecondary,
  grayLight: "#2A2A3E",
  grayLighter: "#121220",
  ink: Colors.textPrimary,
  surface: Colors.bgCard,
  surfaceTint: Colors.bgCardAlt,

  paidGreen: Colors.accent,
  missedRed: Colors.danger,
  amber: Colors.warning,

  success: Colors.success,
  warning: Colors.warning,
  error: Colors.danger,
  info: Colors.primaryLight,

  text: Colors.textPrimary,
  textSecondary: Colors.textSecondary,
  textMuted: Colors.textMuted,
  background: Colors.bg,
  backgroundSecondary: "#0D1B2A",
  border: Colors.border,

  card: Colors.bgCard,
  cardElevated: Colors.bgCardAlt,
  primary: Colors.primary,
  primarySoft: "#0E2D55",
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

export const gradient = Gradients.screenBg as readonly [string, string];

export function getGradient(themeColors: AppColors) {
  return [themeColors.background, themeColors.backgroundSecondary] as const;
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
