export type RadarHorizon = 7 | 30 | 90;

/** Treats collections as uncertain and caps expected receipts by total receivables. */
export function estimateExpectedCollections(weeklyScheduled: number, receivables: number, onTimePercent: number, days: RadarHorizon): number {
  const weekly = Number.isFinite(weeklyScheduled) ? Math.max(0, weeklyScheduled) : 0;
  const outstanding = Number.isFinite(receivables) ? Math.max(0, receivables) : 0;
  const confidence = Number.isFinite(onTimePercent) ? Math.max(0, Math.min(100, onTimePercent)) / 100 : 0;
  return Math.min(outstanding, weekly * days / 7 * confidence);
}

export function projectRadarBalance(currentCash: number, expectedCollections: number, plannedWithdrawals: number, minimumReserve: number) {
  const projected = Math.max(0, currentCash) + Math.max(0, expectedCollections) - Math.max(0, plannedWithdrawals);
  return { projectedCash: projected, belowMinimum: projected < Math.max(0, minimumReserve), shortfallAmount: Math.max(0, minimumReserve - projected) };
}
