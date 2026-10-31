export const Colors = {
  amberGlow: "#D8AA55",
  honeyBronze: "#E9C77E",
  white: "#ffffff",
  frozenWater: "#EAF4F1",
  lightSeaGreen: "#11766E",
  nearBlack: "#102D39",
  bg: "#F3F7F6",
  bgCard: "#ffffff",
  bgCardLight: "#ffffff",
  primary: "#102D39",
  primaryText: "#ffffff",
  textOnDark: "#ffffff",
  textOnLight: "#102D39",
  textMuted: "#70838A",
  border: "#DCE7E3",
  borderLight: "#EAF0EE",
  danger: "#B94B45",
  warning: "#D8AA55",
  accent: "#D8AA55",
  success: "#187A68",
  overlay: "rgba(9, 31, 37, 0.58)",
  cardShadow: "#000000",
};

export const Gradients = {
  screenBg: ["#F7FAF9", "#EEF4F2"] as const,
  header: ["#102D39", "#174650"] as const,
  heroCard: ["#102D39", "#174650"] as const,
  ctaButton: ["#11766E", "#0D655F"] as const,
  dangerButton: ["#B94B45", "#963B38"] as const,
  collectedCard: ["#174650", "#102D39"] as const,
  startButton: ["#11766E", "#0D655F"] as const,
  primaryGradient: ["#102D39", "#174650"] as const,
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
  blue1: "#1B5960",
  blue2: "#102D39",
  blue3: "#0B222C",
  teal: "#11766E",
  indigo: "#3F6D78",
  coral: Colors.amberGlow,
  mint: "#EAF4F1",
  sky: "#F1F6F4",

  white: Colors.white,
  gray: "#70838A",
  grayLight: "#EAF0EE",
  grayLighter: "#F7FAF9",
  ink: Colors.nearBlack,
  surface: Colors.bgCard,
  surfaceTint: "#F7FAF9",

  paidGreen: Colors.success,
  missedRed: Colors.danger,
  amber: Colors.warning,

  success: Colors.success,
  warning: Colors.warning,
  error: Colors.danger,
  info: Colors.frozenWater,

  text: Colors.textOnLight,
  textSecondary: "#4D666D",
  textMuted: Colors.textMuted,
  background: Colors.bg,
  backgroundSecondary: "#EEF4F2",
  border: Colors.border,
  borderLight: Colors.borderLight,

  card: Colors.bgCard,
  cardElevated: "#F7FAF9",
  primary: Colors.primary,
  primarySoft: "rgba(16,45,57,0.09)",
  overlay: Colors.overlay,
  glass: "rgba(255,255,255,0.76)",
  glassBorder: Colors.border,
  chartGrid: Colors.border,
  focusRing: Colors.honeyBronze,
  destructiveSoft: "rgba(185,75,69,0.12)",
  successSoft: "rgba(17,118,110,0.12)",
  warningSoft: "rgba(216,170,85,0.16)",
};

export const darkColors: typeof lightColors = {
  ...lightColors,
  background: "#0B1C22",
  backgroundSecondary: "#102D39",
  card: "#132B32",
  cardElevated: "#1B3941",
  surface: "#132B32",
  surfaceTint: "#10242A",
  glass: "rgba(19,43,50,0.88)",
  glassBorder: "#315058",
  border: "#315058",
  borderLight: "#263F46",
  text: "#ffffff",
  textSecondary: "#C0D0D0",
  textMuted: "#9EB5B6",
  gray: "#9EB5B6",
  grayLight: "#1B3941",
  grayLighter: "#10242A",
  ink: "#ffffff",
  white: "#F5FAF8",
  sky: "#1B3941",
  mint: "#132B32",
  primary: "#46B6A5",
  primarySoft: "rgba(70,182,165,0.18)",
  destructiveSoft: "rgba(185,75,69,0.22)",
  successSoft: "rgba(70,182,165,0.2)",
  warningSoft: "rgba(216,170,85,0.22)",
  overlay: "rgba(5,17,20,0.78)",
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
