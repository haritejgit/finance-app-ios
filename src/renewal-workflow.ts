export function isRenewalContextReady(input: {
  loading: boolean;
  hasError: boolean;
  customerId?: string | null;
  customer?: { id?: string } | null;
  loan?: { customerId?: string; status?: string } | null;
}): boolean {
  return !input.loading && !input.hasError && !!input.customerId &&
    input.customer?.id === input.customerId && input.loan?.customerId === input.customerId &&
    input.loan.status !== "RENEWED";
}

/** Synchronous ref lock prevents a second submit before React commits a disabled state. */
export function acquireRenewalSubmitLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}
