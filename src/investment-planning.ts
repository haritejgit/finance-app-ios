export type InvestmentPlan = {
  id: string;
  name: string;
  currentBalance: number;
  monthlyContribution: number;
  annualReturnPercent: number;
  withdrawalStartDate: number;
  monthlyWithdrawal: number;
  endDate?: number;
  minimumBalance: number;
  notes: string;
  status: "active" | "paused";
  updatedAt: number;
};

export type InvestmentProjectionRow = { date: number; balance: number; contribution: number; withdrawal: number };

export function validateInvestmentPlan(plan: InvestmentPlan): void {
  if (!plan.id || !plan.name.trim() || plan.name.trim().length > 120 || plan.notes.length > 1000 || !Number.isFinite(plan.currentBalance) || plan.currentBalance < 0 || !Number.isFinite(plan.monthlyContribution) || plan.monthlyContribution < 0 || !Number.isFinite(plan.monthlyWithdrawal) || plan.monthlyWithdrawal <= 0 || !Number.isFinite(plan.withdrawalStartDate) || plan.withdrawalStartDate <= 0 || (plan.endDate !== undefined && (!Number.isFinite(plan.endDate) || plan.endDate < plan.withdrawalStartDate)) || !Number.isFinite(plan.minimumBalance) || plan.minimumBalance < 0 || !Number.isFinite(plan.annualReturnPercent) || plan.annualReturnPercent < -99 || plan.annualReturnPercent > 100 || !["active", "paused"].includes(plan.status)) {
    throw new Error("Review the plan fields. Amounts must be valid and the annual return must be between -99% and 100%.");
  }
}

export function projectInvestmentPlan(plan: InvestmentPlan, now = Date.now(), maxMonths = 240) {
  const monthlyRate = Math.pow(1 + Math.max(-99, plan.annualReturnPercent) / 100, 1 / 12) - 1;
  let balance = Math.max(0, plan.currentBalance);
  let availableOnStart: number | null = null;
  let withdrawalMonths = 0;
  let firstShortfallDate: number | null = null;
  const rows: InvestmentProjectionRow[] = [];
  const startMonth = new Date(now);
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  const withdrawalStart = new Date(plan.withdrawalStartDate);
  withdrawalStart.setDate(1);
  withdrawalStart.setHours(0, 0, 0, 0);
  const startOffset = Math.max(0, (withdrawalStart.getFullYear() - startMonth.getFullYear()) * 12 + withdrawalStart.getMonth() - startMonth.getMonth());
  const end = plan.endDate ? new Date(plan.endDate) : null;

  for (let index = 0; index < maxMonths; index++) {
    const date = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1).getTime();
    if (end && date > end.getTime()) break;
    const contribution = index < startOffset ? Math.max(0, plan.monthlyContribution) : 0;
    balance = (balance + contribution) * (1 + monthlyRate);
    const withdrawal = index >= startOffset && plan.status === "active" ? Math.max(0, plan.monthlyWithdrawal) : 0;
    if (index === startOffset) availableOnStart = balance;
    if (withdrawal > 0) {
      if (balance - withdrawal < Math.max(0, plan.minimumBalance)) {
        if (firstShortfallDate === null) firstShortfallDate = date;
        break;
      }
      balance -= withdrawal;
      withdrawalMonths++;
    }
    rows.push({ date, balance, contribution, withdrawal });
  }

  const monthsUntilStart = Math.max(0, startOffset);
  const startReached = plan.withdrawalStartDate <= now;
  const projectionIncomplete = !startReached && startOffset >= maxMonths;
  return {
    rows,
    availableOnStart: availableOnStart ?? (startReached ? plan.currentBalance : null),
    monthsUntilStart,
    withdrawalMonths,
    firstShortfallDate,
    estimatedRemainingBalance: balance,
    isSustainable: firstShortfallDate === null && plan.status === "active" && !projectionIncomplete,
    projectionIncomplete,
    assumptions: ["Monthly contributions are made before the withdrawal start month.", "Returns compound monthly at the selected annual rate; 0% is used when no return is selected.", "Withdrawals occur once per month and must preserve the minimum balance."],
  };
}
