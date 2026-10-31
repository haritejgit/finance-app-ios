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

/** Refuse a new renewal when inconsistent records could leave two loans active. */
export function assertSingleActiveLoan(loans: { status: string }[]): void {
  if (loans.filter((loan) => loan.status === "ACTIVE").length > 1) {
    throw new Error("More than one active loan exists for this customer. Review the loan records before renewing.");
  }
}

