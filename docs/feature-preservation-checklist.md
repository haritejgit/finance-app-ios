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
- [x] Guard renewal initialization against stale customer/loan context and prevent duplicate submissions; pure regression tests cover selection readiness and submit locking.
- [x] Preserve explicit processing-fee choice and net disbursement handling for new loans and renewals, with legacy fallback; unit tests cover enabled/disabled and legacy cases.
- [x] Add triple-tap custom recommendation editing with validation; unit tests cover tap behavior and valid/invalid values.
- [x] Add owner-private investment plans with projection calculations; tests cover contributions, withdrawals, reserve thresholds, and invalid inputs.
- [x] Add Cash Flow Radar projections with separate receivables and cash, configurable reserve threshold, and incomplete-data handling.
- [x] Restrict diagnostic log creation to short, sanitized records owned by the signed-in user; Firestore emulator tests cover valid and rejected records.
- [x] Honor the operating system's reduced-motion preference in shared screen, list, and login animations; subscribe once at the app root and clean up the accessibility listener.
- [x] Replace the web icon-font barrel import with platform-specific SVG/native icon renderers; preserve the same SVG icon paths on web and Ionicons on iOS/Android.
- [x] Preserve and deploy the existing app/Firestore rules and indexes configuration; rules tests pass against the emulator.
- [ ] Exercise every owner-authenticated workflow on a production-like test account, including renewal, fee scenarios, reports/exports, plans, radar, and mobile Safari. Do not use or publish customer data as test fixtures.
- [ ] Collect comparable before/after runtime profiles on representative desktop and iPhone Safari devices. Bundle export results alone are not a runtime performance measurement.
- [ ] Complete a full responsive visual QA pass of every existing screen and dark-mode state.
- [ ] Resolve the current type-check environment failure caused by unavailable `firebase-functions` and `firebase-admin` dependencies, then rerun type checking.
- [ ] Run a dependency vulnerability audit when the package registry is reachable; the current environment could not resolve the registry.

## Validation snapshot

- `npm test`: 18 tests passed.
- Firestore rules emulator tests: 6 tests passed with Temurin JDK 21.
- `npm run lint -- --no-cache`: completed with 0 errors and 69 warnings.
- `npm run build`: production web export completed after the reduced-motion and icon updates; the entry bundle dropped from 3.13 MB to 2.66 MB, and emitted assets dropped from 41 to 22. The web export no longer contains icon font assets; the 1.24 MB spreadsheet export remains in its separate on-demand chunk. These are build artifact sizes, not transfer or runtime profile measurements.
- `npx tsc --noEmit`: blocked by missing `firebase-functions` and `firebase-admin` packages in `functions/src/index.ts`.
- Production Hosting and Firestore rules deployed to Firebase project `finance-for-ios`, Hosting target `app`.
- The source folder supplied for this task is a snapshot without `.git`; changes are synchronized to the existing GitHub improvement branch rather than created from local Git history.
