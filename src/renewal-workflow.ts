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

/** Keep an early Renew tap pending only while that same customer's profile refresh is in flight. */
export function shouldOpenPendingRenewal(pendingCustomerId: string | null, selectedCustomerId: string | null | undefined, loading: boolean): boolean {
  return !loading && !!selectedCustomerId && pendingCustomerId === selectedCustomerId;
}

/** Synchronous ref lock prevents a second submit before React commits a disabled state. */
export function acquireRenewalSubmitLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

/** Release the already-acquired submit lock after confirmation and all writes finish, even on cancellation or failure. */
export async function runWithRenewalSubmitLock<T>(lock: { current: boolean }, submit: () => Promise<T>): Promise<T> {
  try {
    return await submit();
  } finally {
    lock.current = false;
  }
}

