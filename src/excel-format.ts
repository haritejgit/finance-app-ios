export function formatLoanDisbursementWeekCell(params: {
  renewalClosureAmount: number;
  displayedAmount: number;
  regularPaidAmount: number;
  carryForwardNote?: string;
}): string {
  const parts: string[] = [];
  if (params.renewalClosureAmount > 0) {
    parts.push(String(Math.trunc(params.renewalClosureAmount)));
  }
  parts.push(String(Math.trunc(params.displayedAmount)));
  if (params.regularPaidAmount > 0) {
    parts.push(String(Math.trunc(params.regularPaidAmount)));
  }
  const cellValue = parts.join("\n");
  return params.carryForwardNote ? `${params.carryForwardNote}\n${cellValue}` : cellValue;
}
