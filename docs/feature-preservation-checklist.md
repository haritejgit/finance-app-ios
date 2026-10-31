# Feature preservation and verification checklist

This checklist records the existing product areas inspected while improving Karthikeya Finance. It is a route and workflow inventory, not a claim that every screen has been exercised with a production account. Keep it updated when a feature is added, moved, or changed.

## Existing routes and workflows to preserve

- [ ] Sign-in, password recovery, authentication redirects, and session persistence (`app/(01)/login.tsx`, `app/(01)/index.tsx`).
- [ ] Day/shift dashboard, analytics summaries, search and filters, navigation, and cash-flow radar (`app/(02)/shift-selection.tsx`).
- [ ] Village and route customer lists (`app/village/[day]/[shift].tsx`, `app/customer/[villageId].tsx`).
- [ ] Customer registration and editing, Aadhaar duplicate/block checks, GPS capture, customer status, and close/reopen actions.
- [ ] Cash and PhonePe collection, due marking, payment history, and customer loan profile (`app/profile/[customerId].tsx`).
- [ ] New loan disbursement and renewal flows, including settlement, configured processing-fee choice, wallet mode, validation, and duplicate-submit protection.
- [ ] Smart Loan Recommendation, custom amount editing, and customer history (`app/ai-advisor.tsx`, `app/history.tsx`).
- [ ] Reports and existing Excel/PDF/image exports (`app/(03)/reports.tsx`).
- [ ] Analytics, trends, dues, collection, disbursement, investment, expense, and wallet calculations (`app/(04)/graph.tsx`).
- [ ] Settings, nested account management, weekly trackers, and their exports (`app/(05)/settings.tsx`).
- [ ] Account notes, cash/PhonePe opening balances, expenses, investments, and investment plans (`app/(08)/account.tsx`).
- [ ] AI screens, insights, blocked Aadhaar checks, language selection, dark mode, and other existing settings (`app/(06)/ai.tsx`, `app/ai-advisor.tsx`, `app/insights.tsx`, `app/(07)/block-aadhaar.tsx`).
- [ ] Android and iOS native projects remain in the repository; web-specific text sizing must not regress the native experience.

## Data and accounting invariants

- [ ] Operational records remain scoped to their owner; private account notes remain private and excluded from exports.
- [ ] Historical loans/payments and legacy records without explicit fee fields retain backward-compatible handling.
- [ ] Outstanding receivables are not counted as current cash; projections label assumptions and uncertainty.
- [ ] Collection/disbursement/renewal calculations preserve the established settlement model and do not duplicate fees or transactions.
- [ ] No production customer, loan, payment, village, or wallet records are migrated, deleted, or rewritten by these changes.

## Changes and verification recorded for this improvement branch

- [x] Prevent iOS Safari focus zoom on search and other text fields using a global 16px web input size; live production computed style was checked.
- [x] Match the pre-hydration web theme to saved/system preferences and the navy design tokens; allow browser zoom for accessibility while keeping 16px inputs.
- [x] Add a regression test that confirms the global 16px input/textarea rule is loaded by the app root.
- [x] Prevent a silent Renew no-op during focus refresh: keep a tap pending for the selected customer and open only after that customer's current loan context loads; tests cover same-customer waiting and customer-switch rejection.
- [x] Guard renewal initialization against stale customer/loan context and prevent duplicate submissions; pure regression tests cover selection readiness and submit locking.
- [x] Keep the renewal submit lock held through confirmation and writes, and release it after cancellation or thrown confirmation errors; regression coverage checks both paths.
- [x] Preserve explicit processing-fee choice and net disbursement handling for new loans and renewals, with legacy fallback; unit tests cover enabled/disabled and legacy cases.
- [x] Add triple-tap custom recommendation editing with validation; unit tests cover tap behavior and valid/invalid values.
- [x] Validate persisted custom recommendation amounts in Firestore as positive whole numbers within the UI limit; emulator coverage verifies per-customer persistence, owner scope, invalid values, and compatibility with legacy values during unrelated edits.
- [x] Add owner-private investment plans with projection calculations; tests cover contributions, withdrawals, reserve thresholds, and invalid inputs.
- [x] Add Cash Flow Radar projections with separate receivables and cash, configurable reserve threshold, and incomplete-data handling.
- [x] Restrict diagnostic log creation to short, sanitized records owned by the signed-in user; Firestore emulator tests cover valid and rejected records.
- [x] Remove HTML injection from the JPG export status panel by rendering errors, filenames, and generated URLs through text and DOM properties; bind status messages to the expected window and origin, with a source-level regression test.
- [x] Route Gemini and Anthropic requests through signed-in Firebase callable functions, validate prompt and chat sizes, limit each account to 20 provider requests per minute, remove direct client API-key use, and strip customer names, IDs, phone numbers, and village names from provider context; tests cover authentication, input bounds, rate limits, chat roles, and PII stripping. Firestore's default-deny rule keeps the server-only usage counters inaccessible to clients.
- [x] Prevent a nested account from changing its profile role/owner or deleting and recreating its profile to gain access to another owner's records; preserve the owner's active-status and nested-account deletion workflow. Firestore emulator regression tests cover both denied escalation and allowed owner management.
- [x] Prevent users from self-assigning a nested role and arbitrary owner during profile creation; preserve owner self-profile creation and legacy nested-account profile recovery only when an owner-managed nested-account record establishes the relationship.
- [x] Lock nested-account owner, master, and nested-user identity fields to the existing owner; only owners can update or delete an established account, and new accounts must match the owner-created user ID relationship.
- [x] Keep nested transaction and expense entries tied to the established owner/agent pair; prevent forged cross-owner submissions, ownership changes, and nested-agent changes to the exported state while allowing owner reconciliation.
- [x] Validate temporary nested customer records before owner import, including field shape, positive principal, bounded processing fee, identifiers, contact field sizes, coordinates, and owner/agent relationship; reject unexpected fields.
- [x] Reduce scheduled due-marking reads without changing first-active-loan or legacy customer activity semantics: query active loans once, retain the first active loan per customer in Firestore document order, and fetch only payments matching that customer and loan.
- [x] Stop changing stored loan status/balances during duplicate-active-loan reads; keep selecting the latest loan for current views and the date-appropriate loan for historical views, with regression tests proving stored records remain unchanged.
- [x] Prevent renewal when another active loan exists for the same customer, even if the selected loan is closed or stale; permit renewal only when the active record is the selected loan, and leave every loan unchanged when the guard rejects.
- [x] Support isolated Firebase QA builds only when an explicit expected project ID matches the app project; keep the default and `.env.example` pinned to production, with a staging setup guide that avoids Hosting deployment.
- [x] Honor the operating system's reduced-motion preference in shared screen, list, and login animations; subscribe once at the app root and clean up the accessibility listener.
- [x] Replace the web icon-font barrel import with platform-specific SVG/native icon renderers; preserve the same SVG icon paths on web and Ionicons on iOS/Android.
- [x] Remove the unused vulnerable `xlsx` package while retaining the lazy-loaded `xlsx-js-style` export implementation; verify array and base64 workbook output with styled in-memory fixtures.
- [x] Preserve and deploy the existing app/Firestore rules and indexes configuration; rules tests pass against the emulator.
- [ ] Exercise every owner-authenticated workflow on a production-like test account, including renewal, fee scenarios, reports/exports, plans, radar, and mobile Safari. Do not use or publish customer data as test fixtures.
- [ ] Collect comparable before/after runtime profiles on representative desktop and iPhone Safari devices. Bundle export results alone are not a runtime performance measurement.
- [ ] Complete a full responsive visual QA pass of every existing screen and dark-mode state.
- [x] Resolve the type-check environment issue by installing Cloud Functions dependencies from the checked-in lockfile; `npx tsc --noEmit` now passes.
- [x] Complete live root and Cloud Functions npm audits and apply compatible lockfile updates. Remove the unused vulnerable `xlsx` direct dependency while preserving exports through the existing lazy-loaded `xlsx-js-style` library. The root production dependency tree still reports 38 advisories (0 critical, 9 high, 28 moderate, 1 low); the Cloud Functions production dependency tree reports 10 moderate advisories and no high or critical items. Remaining high findings require major Expo/React Native/Firebase SDK upgrades; plan those compatibility upgrades separately rather than forcing a framework migration into this preservation pass.

## Validation snapshot

- `npm test`: 39 tests passed after adding the conflicting-active-loan and Firebase project guard cases. The suite covers read-only duplicate-loan selection, historical loan selection, same-customer Renew waiting through profile refresh, and renewal-lock cleanup after cancellation/failure, alongside Safari input-font/accessibility, theme, exports, AI proxy validation, and due-marking selection tests.
- Cloud Functions `npm run build`: TypeScript compilation passed after the Node 22 runtime, compatible dependency updates, and secure AI proxy changes; 3 focused due-selection tests passed.
- Firestore rules emulator tests: 13 tests passed after dependency updates with Temurin JDK 21, including malformed and forged temporary customer import records, nested transaction/expense owner spoofing and tampering, forged nested profile/account creation, trusted owner-link tampering, legacy nested-account profile recovery, nested-profile role/owner tampering and self-deletion attempts, the owner's create/deactivate/delete and transaction reconciliation flow, client denial for server-only AI usage counters, and custom loan recommendation validation with legacy compatibility.
- `npm run lint -- --no-cache`: completed with 0 errors and 68 warnings after the AI proxy additions.
- `npm run build`: production web export completed after the reduced-motion and icon updates; the entry bundle dropped from 3.13 MB to 2.66 MB at that stage. The current AI callable client build is 2.69 MB and emits 22 assets (down from 41); the web export contains no icon font assets, and the 1.24 MB styled spreadsheet export remains in its separate on-demand chunk. These are build artifact sizes, not transfer or runtime profile measurements.
- `npx tsc --noEmit`: passed after installing Cloud Functions dependencies from the checked-in lockfile.
- Production Hosting and Firestore rules are deployed to Firebase project `finance-for-ios`, Hosting target `app`; the latest Hosting release completed successfully through the Firebase CLI. An external HTTP check could not resolve the site hostname in the current environment; the prior release had returned HTTP 200.
- The deployed build keeps the production Firebase project pinned by default and supports isolated staging only with an explicit expected project ID. AI requests remain disabled until both server functions are deployed.
- The due-marking function optimization and its composite index are deployed. The function now uses the supported Node.js 22 runtime; its current production status was confirmed with Firebase.
- The secure AI proxy is implemented locally and its input/PII validation is tested. The Secret Manager API was enabled, but the AI callable endpoints are not deployed; the two replacement secret values have not been confirmed. No secret values were accessed by the agent. Follow [AI server setup](ai-server-setup.md) to provision fresh keys through the CLI prompts without putting them in source control.
- The source folder supplied for this task is a snapshot without `.git`, and Git is not installed. Changes are synchronized to the existing GitHub improvement branch through the connected GitHub integration; the renewal confirmation cleanup was pushed in commit `5f64696`.
- A provider-key-looking value was sent in chat and was not used or deployed. Treat it as compromised: revoke it, set fresh provider secrets only through the Firebase CLI prompts, and do not share secret values in chat. The AI callable functions remain undeployed until new secrets are safely configured.
- Financial-integrity review found and fixed `getActiveLoan` and `getActiveLoansByCustomerIds` changing older duplicate active loans to `RENEWED` with `balanceAmount: 0` while reading. Reads now preserve stored records and keep deterministic display selection; no production records were inspected or changed. Any records previously altered by old releases still require an owner-approved reconciliation plan and backup before repair.
- The Renew failure is consistent with the profile focus reload setting `isLoading` while retaining old customer/loan state: the button can still be visible, but the open handler silently returned. The handler now holds the tap for that selected customer and opens after its fresh loan context loads. A production-like owner-auth reproduction remains unverified because no safe test account was available.

