export const Colors = {
  amberGlow: "#ff9f1c",
  honeyBronze: "#ffbf69",
  white: "#ffffff",
  frozenWater: "#cbf3f0",
  lightSeaGreen: "#2ec4b6",
  nearBlack: "#111827",
  bg: "#cbf3f0",
  bgCard: "#ffffff",
  bgCardLight: "#ffffff",
  primary: "#2ec4b6",
  primaryText: "#111827",
  textOnDark: "#ffffff",
  textOnLight: "#111827",
  textMuted: "#5f7f7b",
  border: "#9edbd6",
  borderLight: "#d8f7f4",
  danger: "#d94841",
  warning: "#ff9f1c",
  accent: "#ffbf69",
  success: "#2ec4b6",
  overlay: "rgba(17, 24, 39, 0.55)",
  cardShadow: "#000000",
};

export const Gradients = {
  screenBg: ["#cbf3f0", "#2ec4b6"] as const,
  header: ["#ffffff", "#cbf3f0"] as const,
  heroCard: ["#ffffff", "#cbf3f0"] as const,
  ctaButton: ["#ff9f1c", "#ffbf69"] as const,
  dangerButton: ["#d94841", "#a8302b"] as const,
  collectedCard: ["#ffffff", "#cbf3f0"] as const,
  startButton: ["#ff9f1c", "#ffbf69"] as const,
  primaryGradient: ["#2ec4b6", "#cbf3f0"] as const,
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
  blue1: Colors.lightSeaGreen,
  blue2: Colors.lightSeaGreen,
  blue3: "#158f84",
  teal: Colors.lightSeaGreen,
  indigo: "#178f86",
  coral: Colors.amberGlow,
  mint: Colors.frozenWater,
  sky: "#e8fbf9",

  white: Colors.white,
  gray: "#5f7f7b",
  grayLight: "#e8fbf9",
  grayLighter: "#f5fffe",
  ink: Colors.nearBlack,
  surface: Colors.bgCard,
  surfaceTint: "#f6fffe",

  paidGreen: Colors.success,
  missedRed: Colors.danger,
  amber: Colors.warning,

  success: Colors.success,
  warning: Colors.warning,
  error: Colors.danger,
  info: Colors.frozenWater,

  text: Colors.textOnLight,
  textSecondary: "#426c67",
  textMuted: Colors.textMuted,
  background: Colors.bg,
  backgroundSecondary: Colors.lightSeaGreen,
  border: Colors.border,

  card: Colors.bgCard,
  cardElevated: "#f6fffe",
  primary: Colors.primary,
  primarySoft: "rgba(46,196,182,0.16)",
  overlay: Colors.overlay,
  glass: "rgba(255,255,255,0.76)",
  glassBorder: Colors.border,
  chartGrid: Colors.border,
  focusRing: Colors.honeyBronze,
  destructiveSoft: "rgba(217,72,65,0.14)",
  successSoft: "rgba(46,196,182,0.16)",
  warningSoft: "rgba(255,159,28,0.18)",
};

export const darkColors: typeof lightColors = { ...lightColors };

export type AppColors = typeof lightColors;

export const colors = darkColors;

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
