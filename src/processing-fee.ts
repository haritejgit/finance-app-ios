/**
 * Existing business rule: retain ₹20 for every full ₹1,000 of principal.
 * Keep legacy loan records on this rule unless they explicitly record the
 * processing-fee choice made when the loan was created.
 */
export const PROCESSING_FEE_PER_THOUSAND = 20;

export function calculateProcessingFee(principalAmount: number, charged = true): number {
  if (!charged || !Number.isFinite(principalAmount) || principalAmount <= 0) return 0;
  return Math.floor(principalAmount / 1000) * PROCESSING_FEE_PER_THOUSAND;
}

export function calculateNetDisbursement(principalAmount: number, charged = true): number {
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) return 0;
  return Math.max(0, principalAmount - calculateProcessingFee(principalAmount, charged));
}

export function getRecordedNetDisbursement(
  loan: { principalAmount?: number; principal_amount?: number; loanAmount?: number; amount?: number; processingFeeCharged?: boolean; processingFeeAmount?: number }
): number {
  const principal = Number(loan.principalAmount ?? loan.principal_amount ?? loan.loanAmount ?? loan.amount ?? 0);
  if (typeof loan.processingFeeCharged !== "boolean") return calculateNetDisbursement(principal);
  const fee = loan.processingFeeCharged
    ? (typeof loan.processingFeeAmount === "number" ? Math.max(0, loan.processingFeeAmount) : calculateProcessingFee(principal))
    : 0;
  return Math.max(0, principal - fee);
}
