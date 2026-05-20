export const lightColors = {
  blue1: "#0F766E",
  blue2: "#2563EB",
  blue3: "#0F172A",
  teal: "#0D9488",
  indigo: "#4F46E5",
  coral: "#F97316",
  mint: "#DDFCF4",
  sky: "#EAF4FF",

  white: "#FFFFFF",
  gray: "#64748B",
  grayLight: "#EEF2F7",
  grayLighter: "#F8FAFC",
  ink: "#0F172A",
  surface: "#FFFFFF",
  surfaceTint: "#F8FAFC",

  paidGreen: "#16C784",
  missedRed: "#EA3943",
  amber: "#F59E0B",

  success: "#16C784",
  warning: "#F59E0B",
  error: "#EA3943",
  info: "#2563EB",

  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  background: "#F5F7FB",
  backgroundSecondary: "#EEF4FF",
  border: "#E2E8F0",

  card: "#FFFFFF",
  cardElevated: "#FFFFFF",
  primary: "#2563EB",
  primarySoft: "#DBEAFE",
  overlay: "rgba(15,23,42,0.48)",
  glass: "rgba(255,255,255,0.72)",
  glassBorder: "rgba(255,255,255,0.45)",
  chartGrid: "#E2E8F0",
  focusRing: "#93C5FD",
  destructiveSoft: "#FEE2E2",
  successSoft: "#DCFCE7",
  warningSoft: "#FEF3C7",
};

export const darkColors: typeof lightColors = {
  blue1: "#0B0F19",
  blue2: "#5B8CFF",
  blue3: "#18233A",
  teal: "#2DD4BF",
  indigo: "#8B9DFF",
  coral: "#FB923C",
  mint: "#123B34",
  sky: "#172554",

  white: "#FFFFFF",
  gray: "#9AA4B2",
  grayLight: "#253047",
  grayLighter: "#0B0F19",
  ink: "#F5F7FA",
  surface: "#131A2A",
  surfaceTint: "#0F1626",

  paidGreen: "#16C784",
  missedRed: "#EA3943",
  amber: "#FBBF24",

  success: "#16C784",
  warning: "#FBBF24",
  error: "#EA3943",
  info: "#5B8CFF",

  text: "#F5F7FA",
  textSecondary: "#9AA4B2",
  textMuted: "#768195",
  background: "#0B0F19",
  backgroundSecondary: "#101827",
  border: "#253047",

  card: "#131A2A",
  cardElevated: "#18233A",
  primary: "#5B8CFF",
  primarySoft: "#1B2A50",
  overlay: "rgba(0,0,0,0.68)",
  glass: "rgba(19,26,42,0.76)",
  glassBorder: "rgba(148,163,184,0.2)",
  chartGrid: "#253047",
  focusRing: "#5B8CFF",
  destructiveSoft: "#3A151C",
  successSoft: "#0D3327",
  warningSoft: "#3B2D12",
};

export type AppColors = typeof lightColors;

export const colors = lightColors;

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
