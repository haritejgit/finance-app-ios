/**
 * Format amount to display in K (thousands) or M (millions)
 * Amounts over 999K will be displayed as Millions
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "Rs.500k", "Rs.1.5M", etc.
 */
export function formatAmountInKM(value: number, decimals: number = 1): string {
  if (value >= 1000000) {
    // Convert to millions
    const millions = value / 1000000;
    return `Rs.${millions.toFixed(decimals)}M`;
  } else if (value >= 1000) {
    // Convert to thousands
    const thousands = value / 1000;
    return `Rs.${thousands.toFixed(decimals)}k`;
  } else {
    // Less than 1000, show as is
    return `Rs.${value.toFixed(decimals)}`;
  }
}

/**
 * Format money in Indian Rupees with comma separators
 * @param value - The numeric value to format
 * @returns Formatted string like "Rs.1,00,000"
 */
export function formatMoney(value: number): string {
  return `Rs.${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
