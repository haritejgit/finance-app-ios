export const lightColors = {
  // Modern Blue Gradient
  blue1: "#2E7FF1",
  blue2: "#1E5BB8", 
  blue3: "#0D3B8B",
  
  // Neutrals
  white: "#FFFFFF",
  gray: "#6B7280",
  grayLight: "#F3F4F6",
  grayLighter: "#F9FAFB",
  
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
  primary: "#1E5BB8",
};

export const darkColors = {
  // Modern Blue Gradient (adjusted for dark mode)
  blue1: "#3B82F6",
  blue2: "#2563EB", 
  blue3: "#1D4ED8",
  
  // Neutrals
  white: "#1F2937",
  gray: "#D1D5DB",
  grayLight: "#374151",
  grayLighter: "#111827",
  
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
