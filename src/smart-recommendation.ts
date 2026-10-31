export const CUSTOM_RECOMMENDATION_MAX = 50_000_000;

export function nextRecommendationTap(previous: { count: number; lastTap: number }, now: number, inactivityMs = 900) {
  const count = now - previous.lastTap <= inactivityMs ? previous.count + 1 : 1;
  return { state: { count: count >= 3 ? 0 : count, lastTap: now }, shouldOpenEditor: count >= 3 };
}

export function isValidCustomRecommendation(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= CUSTOM_RECOMMENDATION_MAX;
}
