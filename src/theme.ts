export const Colors = {
  forestGreen: "#2D3A28",
  white: "#FFFFFF",
  limeAccent: "#DCFFAD",
  nearBlack: "#191818",
  bg: "#2D3A28",
  bgCard: "#3D4E37",
  bgCardLight: "#FFFFFF",
  primary: "#DCFFAD",
  primaryText: "#191818",
  textOnDark: "#FFFFFF",
  textOnLight: "#191818",
  textMuted: "#6B7B6A",
  border: "#4A5E43",
  borderLight: "#D4E8C2",
  danger: "#C0392B",
  warning: "#E67E22",
  accent: "#DCFFAD",
  success: "#52C41A",
  overlay: "rgba(45, 58, 40, 0.85)",
  cardShadow: "#000000",
};

export const Gradients = {
  screenBg: ["#2D3A28", "#1E2A1A"] as const,
  header: ["#2D3A28", "#3D4E37"] as const,
  heroCard: ["#3D4E37", "#2D3A28"] as const,
  ctaButton: ["#DCFFAD", "#C8F090"] as const,
  dangerButton: ["#C0392B", "#96281B"] as const,
  collectedCard: ["#3D4E37", "#2D3A28"] as const,
  startButton: ["#DCFFAD", "#C8F090"] as const,
  primaryGradient: ["#DCFFAD", "#C8F090"] as const,
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
  blue1: Colors.forestGreen,
  blue2: Colors.limeAccent,
  blue3: "#1E2A1A",
  teal: Colors.limeAccent,
  indigo: Colors.limeAccent,
  coral: Colors.warning,
  mint: "#455C3D",
  sky: Colors.bgCard,

  white: Colors.white,
  gray: "#D4E8C2",
  grayLight: Colors.bgCard,
  grayLighter: "#24331F",
  ink: Colors.nearBlack,
  surface: Colors.bgCard,
  surfaceTint: "#33452D",

  paidGreen: Colors.success,
  missedRed: Colors.danger,
  amber: Colors.warning,

  success: Colors.success,
  warning: Colors.warning,
  error: Colors.danger,
  info: Colors.limeAccent,

  text: Colors.textOnDark,
  textSecondary: "#D4E8C2",
  textMuted: Colors.textMuted,
  background: Colors.bg,
  backgroundSecondary: "#1E2A1A",
  border: Colors.border,

  card: Colors.bgCard,
  cardElevated: "#455C3D",
  primary: Colors.primary,
  primarySoft: "rgba(220,255,173,0.18)",
  overlay: Colors.overlay,
  glass: "rgba(61,78,55,0.82)",
  glassBorder: Colors.border,
  chartGrid: Colors.border,
  focusRing: Colors.limeAccent,
  destructiveSoft: "rgba(192,57,43,0.18)",
  successSoft: "rgba(82,196,26,0.18)",
  warningSoft: "rgba(230,126,34,0.18)",
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
