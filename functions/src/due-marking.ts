export type DueMarkingLoan = {
  id: string;
  customerId?: string;
  status?: string;
  [key: string]: unknown;
};

/**
 * Firestore returns each query's documents in document-ID order when no other
 * ordering is requested. Keeping the first ACTIVE loan for each customer
 * therefore matches the existing customer-filtered query followed by find().
 */
export function selectFirstActiveLoansByCustomer(
  orderedLoanDocs: DueMarkingLoan[]
): Map<string, DueMarkingLoan> {
  const selected = new Map<string, DueMarkingLoan>();
  for (const loan of orderedLoanDocs) {
    if (loan.status !== "ACTIVE" || typeof loan.customerId !== "string" || loan.customerId.length === 0) {
      continue;
    }
    if (!selected.has(loan.customerId)) selected.set(loan.customerId, loan);
  }
  return selected;
}
