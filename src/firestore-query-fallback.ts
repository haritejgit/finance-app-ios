/** Retry with a compatible query only while Firestore reports a missing composite index. */
export async function withMissingIndexFallback<T>(
  indexedQuery: () => Promise<T>,
  compatibleQuery: () => Promise<T>
): Promise<T> {
  try {
    return await indexedQuery();
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "failed-precondition") throw error;
    return compatibleQuery();
  }
}
