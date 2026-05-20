import { Loan, Payment } from "./types";

export type CreditScoreBand = "excellent" | "good" | "fair" | "needs attention";

export type CreditScoreSummary = {
  score: number;
  band: CreditScoreBand;
  paidCount: number;
  dueCount: number;
  dueRate: number;
  repaymentProgress: number;
  summary: string;
};

function money(value: any) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function toMillis(value: any) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function getBand(score: number): CreditScoreBand {
  if (score >= 800) return "excellent";
  if (score >= 700) return "good";
  if (score >= 600) return "fair";
  return "needs attention";
}

export function calculateCreditScore(payments: Payment[], activeLoan?: Loan | null): CreditScoreSummary {
  const sorted = [...payments].sort((a, b) => toMillis(b.paymentDate) - toMillis(a.paymentDate));
  const regular = sorted.filter((payment) => payment.paymentType === "REGULAR" || payment.paymentType === "RENEWAL_CLOSURE");
  const dues = sorted.filter((payment) => payment.paymentType === "DUE");
  const totalEvents = regular.length + dues.length;
  const paidCount = regular.filter((payment) => money(payment.amountPaid) > 0).length;
  const dueRate = totalEvents > 0 ? dues.length / totalEvents : 0;
  const repaymentProgress = activeLoan?.totalPayable
    ? Math.max(0, Math.min(1, (money(activeLoan.totalPayable) - money(activeLoan.balanceAmount)) / money(activeLoan.totalPayable)))
    : paidCount > 0
      ? 1
      : 0;
  const lastDueDate = dues[0]?.paymentDate ? toMillis(dues[0].paymentDate) : 0;
  const daysSinceLastDue = lastDueDate ? (Date.now() - lastDueDate) / (24 * 60 * 60 * 1000) : Number.POSITIVE_INFINITY;

  let score = 720;
  score += Math.min(95, paidCount * 9);
  score += Math.round(repaymentProgress * 80);
  score -= Math.round(dueRate * 260);
  score -= Math.min(90, dues.length * 18);
  if (daysSinceLastDue <= 14) score -= 55;
  if (daysSinceLastDue > 45 && dues.length > 0) score += 25;
  if (!activeLoan || money(activeLoan.balanceAmount) <= 0) score += 35;
  if (totalEvents === 0) score = activeLoan ? 680 : 750;

  const boundedScore = Math.max(300, Math.min(900, Math.round(score)));
  const band = getBand(boundedScore);
  const summary =
    dues.length === 0 && paidCount > 0
      ? "Clean repayment behavior with no due marks."
      : dues.length > 0
        ? `${dues.length} due mark${dues.length === 1 ? "" : "s"} found in repayment history.`
        : "No repayment events yet; score uses the active loan baseline.";

  return {
    score: boundedScore,
    band,
    paidCount,
    dueCount: dues.length,
    dueRate,
    repaymentProgress,
    summary,
  };
}
