export type CustomerNumberAssignment = {
  customerId: string;
  villageId: string;
  numericalId: number | null;
  isCurrent: boolean;
  isActive: boolean;
  createdAt: number;
};

export function selectCurrentCustomerIds(assignments: CustomerNumberAssignment[]): Set<string> {
  const currentByNumber = new Map<string, CustomerNumberAssignment>();

  const isPreferredAssignment = (
    candidate: CustomerNumberAssignment,
    existing: CustomerNumberAssignment
  ) => {
    if (candidate.isCurrent !== existing.isCurrent) return candidate.isCurrent;
    if (candidate.isActive !== existing.isActive) return candidate.isActive;
    if (candidate.createdAt !== existing.createdAt) return candidate.createdAt > existing.createdAt;
    return candidate.customerId > existing.customerId;
  };

  for (const assignment of assignments) {
    if (assignment.numericalId === null) continue;
    const key = `${assignment.villageId}:${assignment.numericalId}`;
    const existing = currentByNumber.get(key);
    if (!existing || isPreferredAssignment(assignment, existing)) {
      currentByNumber.set(key, assignment);
    }
  }

  const selectedIds = new Set(
    Array.from(currentByNumber.values(), (assignment) => assignment.customerId)
  );
  for (const assignment of assignments) {
    if (assignment.numericalId === null) selectedIds.add(assignment.customerId);
  }
  return selectedIds;
}
