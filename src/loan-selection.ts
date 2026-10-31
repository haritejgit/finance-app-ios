export type SelectableLoan = {
  id?: string;
  startDate: number;
  status: string;
};

/** Resolve the loan shown for a customer without changing the loan records. */
export function selectLoanForCustomer<T extends SelectableLoan>(loans: T[], targetDate?: number): T | undefined {
  if (loans.length === 0) return undefined;

  const newestFirst = [...loans].sort((a, b) => b.startDate - a.startDate);
  if (targetDate !== undefined) {
    return newestFirst.find((loan) => loan.startDate <= targetDate) ?? newestFirst[newestFirst.length - 1];
  }

  const latestActive = newestFirst.find((loan) => loan.status === "ACTIVE");
  if (latestActive) return latestActive;

  return newestFirst.find((loan) => loan.status === "CLOSED") ?? loans[0];
}

