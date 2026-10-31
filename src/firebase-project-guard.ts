const PRODUCTION_FIREBASE_PROJECT_ID = "finance-for-ios";

/** Keep production pinned unless a build explicitly declares its expected Firebase project. */
export function assertFirebaseProjectId(projectId: string | undefined, expectedProjectId = PRODUCTION_FIREBASE_PROJECT_ID): void {
  if (projectId !== expectedProjectId) {
    throw new Error(
      `Firebase project must be ${expectedProjectId}; received ${projectId ?? "none"}.`
    );
  }
}
