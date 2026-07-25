export const Colors = {
  amberGlow: "#D4AF6A",
  honeyBronze: "#E4C47C",
  white: "#ffffff",
  frozenWater: "#F4F6F9",
  lightSeaGreen: "#12294A",
  nearBlack: "#12294A",
  bg: "#F4F6F9",
  bgCard: "#ffffff",
  bgCardLight: "#ffffff",
  primary: "#12294A",
  primaryText: "#ffffff",
  textOnDark: "#ffffff",
  textOnLight: "#12294A",
  textMuted: "#6B7A8D",
  border: "#E1E6ED",
  borderLight: "#EEF1F5",
  danger: "#B03A3A",
  warning: "#D4AF6A",
  accent: "#D4AF6A",
  success: "#1E7A4C",
  overlay: "rgba(17, 24, 39, 0.55)",
  cardShadow: "#000000",
};

export const Gradients = {
  screenBg: ["#F4F6F9", "#E9EDF3"] as const,
  header: ["#12294A", "#1E3A63"] as const,
  heroCard: ["#12294A", "#1E3A63"] as const,
  ctaButton: ["#12294A", "#1E3A63"] as const,
  dangerButton: ["#B03A3A", "#8F2F2F"] as const,
  collectedCard: ["#1E3A63", "#12294A"] as const,
  startButton: ["#12294A", "#1E3A63"] as const,
  primaryGradient: ["#12294A", "#1E3A63"] as const,
};

export const Fonts = {
  regular: "Onest-Regular",
  medium: "Onest-Medium",
  semiBold: "Onest-SemiBold",
  bold: "Onest-Bold",
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const Radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };
export const FontSize = { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 };

export const lightColors = {
  amberGlow: Colors.amberGlow,
  honeyBronze: Colors.honeyBronze,
  frozenWater: Colors.frozenWater,
  lightSeaGreen: Colors.lightSeaGreen,
  blue1: "#1E3A63",
  blue2: "#12294A",
  blue3: "#0D1F39",
  teal: "#1E7A4C",
  indigo: "#1E3A63",
  coral: Colors.amberGlow,
  mint: "#E8F3ED",
  sky: "#EEF1F5",

  white: Colors.white,
  gray: "#6B7A8D",
  grayLight: "#EEF1F5",
  grayLighter: "#F8FAFC",
  ink: Colors.nearBlack,
  surface: Colors.bgCard,
  surfaceTint: "#F8FAFC",

  paidGreen: Colors.success,
  missedRed: Colors.danger,
  amber: Colors.warning,

  success: Colors.success,
  warning: Colors.warning,
  error: Colors.danger,
  info: Colors.frozenWater,

  text: Colors.textOnLight,
  textSecondary: "#4B5A6D",
  textMuted: Colors.textMuted,
  background: Colors.bg,
  backgroundSecondary: "#E9EDF3",
  border: Colors.border,
  borderLight: Colors.borderLight,

  card: Colors.bgCard,
  cardElevated: "#F8FAFC",
  primary: Colors.primary,
  primarySoft: "rgba(18,41,74,0.10)",
  overlay: Colors.overlay,
  glass: "rgba(255,255,255,0.76)",
  glassBorder: Colors.border,
  chartGrid: Colors.border,
  focusRing: Colors.honeyBronze,
  destructiveSoft: "rgba(176,58,58,0.14)",
  successSoft: "rgba(30,122,76,0.14)",
  warningSoft: "rgba(212,175,106,0.18)",
};

export const darkColors: typeof lightColors = {
  ...lightColors,
  background: "#081526",
  backgroundSecondary: "#12294A",
  card: "#10233D",
  cardElevated: "#173456",
  surface: "#10233D",
  surfaceTint: "#0B1B30",
  glass: "rgba(16,35,61,0.86)",
  glassBorder: "#2B4566",
  border: "#2B4566",
  borderLight: "#253B59",
  text: "#ffffff",
  textSecondary: "#C4D2E2",
  textMuted: "#9FB2C9",
  gray: "#9FB2C9",
  grayLight: "#173456",
  grayLighter: "#0B1B30",
  ink: "#ffffff",
  white: "#ffffff",
  sky: "#173456",
  mint: "#10233D",
  primary: "#D4AF6A",
  primarySoft: "rgba(212,175,106,0.18)",
  destructiveSoft: "rgba(176,58,58,0.22)",
  successSoft: "rgba(30,122,76,0.22)",
  warningSoft: "rgba(212,175,106,0.22)",
  overlay: "rgba(8,21,38,0.78)",
};

export type AppColors = typeof lightColors;

export const colors = lightColors;

export const gradient = Gradients.screenBg;

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
