import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("finance-analytics provides cached analytics helper to unblock dashboard startup", async () => {
  const analyticsSource = await readFile(new URL("../src/finance-analytics.ts", import.meta.url), "utf8");
  assert.ok(
    analyticsSource.includes("export async function getCachedDashboardAnalytics"),
    "Expected getCachedDashboardAnalytics to be exported for instant dashboard hydration"
  );
  assert.ok(
    analyticsSource.includes("memoryAnalyticsCache"),
    "Expected in-memory analytics cache for zero-latency screen transitions"
  );
  assert.ok(
    analyticsSource.includes("getCachedDashboardAnalytics(userId"),
    "Expected subscribeDashboardAnalytics to immediately yield cached analytics"
  );
});

test("runRetroactiveCleanup checks persistent AsyncStorage flag to prevent startup query storms", async () => {
  const repoSource = await readFile(new URL("../src/repository.ts", import.meta.url), "utf8");
  assert.ok(
    repoSource.includes("migration_done_v2_${userId}") || repoSource.includes("migration_done_v2"),
    "Expected AsyncStorage migration key to prevent repeated queries on startup"
  );
  assert.ok(
    repoSource.includes("AsyncStorage.getItem(MIGRATION_KEY)"),
    "Expected AsyncStorage.getItem check on startup"
  );
});

test("auth provider supports cached profile restoration for instant app launch", async () => {
  const authSource = await readFile(new URL("../src/auth-context.tsx", import.meta.url), "utf8");
  assert.ok(
    authSource.includes("getCachedProfile"),
    "Expected getCachedProfile to restore user session immediately"
  );
  assert.ok(
    authSource.includes("setCachedProfile"),
    "Expected setCachedProfile to persist profile for subsequent fast launches"
  );
});

test("root layout allows fast startup without indefinite font or service worker delays", async () => {
  const layoutSource = await readFile(new URL("../app/_layout.tsx", import.meta.url), "utf8");
  assert.ok(
    layoutSource.includes("Platform.OS !== \"web\""),
    "Expected web platform to avoid blocking initial DOM display on custom font loading"
  );
  assert.ok(
    layoutSource.includes("sw_cleaned_v1"),
    "Expected safe session guard for service worker cache clearance"
  );
});

