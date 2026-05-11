export const lightColors = {
  // Modern finance gradient
  blue1: "#0EA5A4",
  blue2: "#2563EB",
  blue3: "#312E81",
  teal: "#0F766E",
  indigo: "#4338CA",
  coral: "#F97316",
  mint: "#DDFCF4",
  sky: "#EAF4FF",
  
  // Neutrals
  white: "#FFFFFF",
  gray: "#6B7280",
  grayLight: "#F3F4F6",
  grayLighter: "#F9FAFB",
  ink: "#111827",
  surface: "#FFFFFF",
  surfaceTint: "#F8FAFC",
  
  // Status Colors
  paidGreen: "#10B981",
  missedRed: "#EF4444",
  amber: "#F59E0B",
  
  // Additional
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
  
  // Text Colors
  text: "#1F2937",
  textSecondary: "#6B7280",
  background: "#FFFFFF",
  backgroundSecondary: "#F9FAFB",
  border: "#E5E7EB",
  
  // UI Components
  card: "#FFFFFF",
  primary: "#2563EB",
};

export const darkColors = {
  // Modern finance gradient (adjusted for dark mode)
  blue1: "#14B8A6",
  blue2: "#3B82F6",
  blue3: "#4F46E5",
  teal: "#2DD4BF",
  indigo: "#818CF8",
  coral: "#FB923C",
  mint: "#0F2F2B",
  sky: "#172554",
  
  // Neutrals
  white: "#1F2937",
  gray: "#D1D5DB",
  grayLight: "#374151",
  grayLighter: "#111827",
  ink: "#F9FAFB",
  surface: "#1F2937",
  surfaceTint: "#111827",
  
  // Status Colors
  paidGreen: "#10B981",
  missedRed: "#F87171",
  amber: "#FBBF24",
  
  // Additional
  success: "#10B981",
  warning: "#FBBF24",
  error: "#F87171",
  info: "#60A5FA",
  
  // Text Colors
  text: "#F9FAFB",
  textSecondary: "#D1D5DB",
  background: "#1F2937",
  backgroundSecondary: "#111827",
  border: "#374151",
  
  // UI Components
  card: "#374151",
  primary: "#3B82F6",
};

export const colors = lightColors;

export const gradient = [colors.blue1, colors.blue2, colors.blue3] as const;

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
