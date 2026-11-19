export function formatLoanOtpMessage(options: {
  loanAmount?: number | string;
  customerName?: string;
  purpose?: "new_loan" | "renewal";
  otpCode?: string;
}): {
  promptText: string;
  shareMessage: string;
  firebaseSmsTemplateRecommendation: string;
} {
  const { loanAmount, customerName, purpose, otpCode } = options;
  const parsed = typeof loanAmount === "number" ? loanAmount : parseFloat(String(loanAmount || "").replace(/,/g, ""));
  const hasValidAmount = Number.isFinite(parsed) && parsed > 0;
  const formattedAmount = hasValidAmount ? `₹${Math.round(parsed).toLocaleString("en-IN")}` : "";

  const isRenewal = purpose === "renewal";
  const actionPhrase = isRenewal ? "approve loan renewal" : "approve loan";

  const promptText = formattedAmount
    ? `If you want to ${actionPhrase} for ${formattedAmount} then share this OTP to our agent.`
    : `If you want to ${actionPhrase} then share this OTP to our agent.`;

  const greeting = customerName?.trim() ? `Dear ${customerName.trim()},` : "Dear Customer,";
  const codeSegment = otpCode ? ` Your OTP is ${otpCode}.` : "";
  const shareMessage = `${greeting}\n\n${promptText}${codeSegment}\n\n- Karthikeya Finance`;

  const firebaseSmsTemplateRecommendation = `%OTP% is your verification code for %APP_NAME%. If you want to approve your loan, share this OTP to our agent.`;

  return {
    promptText,
    shareMessage,
    firebaseSmsTemplateRecommendation,
  };
}
