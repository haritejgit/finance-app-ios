import type { Loan } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export function toMillis(value: any): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value: any): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  return startOfDay(ts) + DAY_MS - 1;
}

export function startOfMonth(offset = 0): number {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfMonth(offset = 0): number {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function weekStart(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getLoanPrincipalAmount(loan: Partial<Loan> & Record<string, any>): number {
  return money(loan.principalAmount ?? loan.principal_amount ?? loan.loanAmount ?? loan.amount);
}

export function calculateDisbursedAmount(loanAmount: number): number {
  const principal = money(loanAmount);
  return Math.max(0, principal - Math.floor(principal / 1000) * 20);
}

export function getNetDistributedAmount(amount: number): number {
  return calculateDisbursedAmount(amount);
}

export function getLoanDistributedAmount(loan: Partial<Loan> & Record<string, any>): number {
  return calculateDisbursedAmount(getLoanPrincipalAmount(loan));
}

export function isRealCollectionPayment(payment: Record<string, any>): boolean {
  const kind = payment.paymentType ?? payment.type ?? "REGULAR";
  if (kind === "DUE") {
    return Number(payment.amountPaid || 0) > 0;
  }
  return kind === "REGULAR" || kind === "CASH" || kind === "PHONE";
}

export function loanWeekIndex(loanStartDate: number, targetDate: number): number {
  const start = startOfDay(loanStartDate);
  const target = startOfDay(targetDate);
  if (!start || !target || target < start) return -1;
  return Math.floor((target - start) / WEEK_MS);
}

export function loanWeekNumber(loanStartDate: number, targetDate: number): number {
  const index = loanWeekIndex(loanStartDate, targetDate);
  return index < 0 ? 0 : index + 1;
}

export function uniqueById<T extends { id?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item, index) => {
    const key = item.id || `missing:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
