export function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function validateIndianPhone(value: string) {
  const digits = normalizeDigits(value);
  if (!digits) return "Phone number is required.";
  if (!/^[6-9]\d{9}$/.test(digits)) return "Enter a valid 10-digit Indian mobile number.";
  return "";
}

export function validateAadhaar(value: string, required = false) {
  const digits = normalizeDigits(value);
  if (!digits && !required) return "";
  if (!/^\d{12}$/.test(digits)) return "Aadhaar must be exactly 12 digits.";
  return "";
}

export function validatePositiveAmount(value: string, label = "Amount") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return `${label} must be a positive number.`;
  return "";
}

export function formatCustomerId(numericalId?: number, fallbackId?: string) {
  if (Number.isInteger(numericalId) && Number(numericalId) > 0) {
    return `#${String(numericalId).padStart(4, "0")}`;
  }
  return `ID: ${(fallbackId ?? "").slice(0, 6).toUpperCase() || "NEW"}`;
}

