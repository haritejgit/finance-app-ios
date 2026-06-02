# Karthikeya Finance Management - AI Context

Purpose: React Native / Expo field-agent tool for weekly micro-loan collection across villages. Target users are finance agents who register customers, disburse small loans, collect weekly payments, mark dues, renew loans, export reports, and reconcile available funds.

Tech stack: React Native, Expo SDK 54, TypeScript, expo-router, Firebase Auth, Cloud Firestore, Firebase Hosting, Excel/PDF export helpers. This is not an Android/Kotlin-first app, though old native files remain in the repo.

Firestore schema:
- `users/{userId}`: id, userId, email?, accountNotes?, cashOpeningBalance?, phonePeOpeningBalance?, walletOpeningDate?. Private fields must never be exported.
- `villages/{id}`: id, name, dayOfWeek, shift, userId.
- `customers/{id}`: id, numericalId, name, phone, aadhar, locationDesc, latitude?, longitude?, aadharSubmitted?, passportPhotoSubmitted?, coName?, coId?, villageId, userId, isActive, createdAt.
- `loans/{id}`: id, customerId, principalAmount, interestAmount, totalPayable, balanceAmount, userId, startDate, status, disbursement_mode?.
- `payments/{id}`: id, loanId, customerId?, amountPaid, paymentDate, weekNumber, paymentType, paymentMode, type, notes?, userId.
- `expenses/{id}`: id, userId, amount, description, date, payment_mode?.
- `investments/{id}`: id, userId, amount, date, investorName?, payment_mode?.
- `balancingFund/{id}`: legacy/current balancing fund overrides.
- `blockedAadhaar/{id}`: aadhaar/aadhaarNumber, reason, blockedAt/blocked_at, blockedBy/blocked_by.

Screen map:
- `app/(01)/login.tsx`: authentication.
- `app/(02)/shift-selection.tsx`: day/shift dashboard.
- `app/village/[day]/[shift].tsx`: villages for a route.
- `app/customer/[villageId].tsx`: customer list, search, stats, add customer, dual Cash/PhonePe pay buttons.
- `app/profile/[customerId].tsx`: profile, loan status, payment history, edit/delete payments, DUE/RENEW.
- `app/(03)/reports.tsx`: report generation and exports.
- `app/(04)/graph.tsx`: analytics dashboard.
- `app/(08)/account.tsx`: balancing fund, wallets, notes, expenses, investments.

Business rules:
Interest is 20%; total payable equals `principalAmount * 1.2`. Cash-to-hand disbursement is `calculateDisbursedAmount(loanAmount) = loanAmount - (Math.floor(loanAmount / 1000) * 20)`. Principal, interest, total payable, and repayment balance stay based on the full loan amount; wallet deductions and disbursement summaries use the reduced cash-to-hand amount. Book numbers are route-scoped. Civil score starts at 600, +10 for good payments, -30 for DUE, clamped 300-900. Excel report disbursement uses a 2% deduction in the requested total-disbursed column. DUE records do not count as collections.

Data flow:
Screens collect form input, call repository functions in `src/repository.ts`, write/read Firestore, then update local state or reload. Analytics reads all user-scoped records and derives dashboard values in `src/finance-analytics.ts`. Wallet balances are calculated in `src/wallet-balances.ts`.

Export architecture:
Exports are built from explicit transaction lists and totals in `src/exports.ts`. Private fields are not part of export payloads. Treat fields marked `// PRIVATE — never export` as settings-only.

Bugs fixed:
Location state is reset and scoped by customer/form instance to avoid stale GPS saves. Search-filtered customer list stats now calculate from the filtered list and show a filtered marker when search is active.

Privacy rules:
`accountNotes`, `cashOpeningBalance`, `phonePeOpeningBalance`, and `walletOpeningDate` must never appear in PDF, Excel, image, or share exports. Add `// PRIVATE — never export` wherever these fields are read.

Analytics logic:
Payments, loans, customers, villages, expenses, and investments are filtered by userId. Payment mode uses `type`/`paymentMode` values CASH, PHONE, DUE. Disbursement mode uses `loans.disbursement_mode`, default CASH. Missing `payment_mode` on old expenses/investments is treated as CASH.

Wallet balance logic:
Cash = cashOpeningBalance - Cash disbursed amounts since walletOpeningDate + Cash collections since walletOpeningDate - Cash expenses + Cash investments.
PhonePe = phonePeOpeningBalance - PhonePe disbursed amounts since walletOpeningDate + PhonePe collections since walletOpeningDate - PhonePe expenses + PhonePe investments.

Payment mode handling:
Customer cards show two equal pay buttons: Cash (#1565C0) and PhonePe (#5F259F). Both open the same modal with a mode toggle. Cash saves type CASH, PhonePe saves type PHONE, DUE saves type DUE.

Disbursement handling:
New loan registration asks how money was given and shows `Cash to hand` using the Rs.20-per-Rs.1,000 deduction. Save `disbursement_mode` as CASH or PHONE. Old loans default to CASH in displays, analytics, and wallet calculations.

DUE handling:
DUE payments are zero-amount ledger marks. The profile ledger shows a trash action only for DUE entries; confirming deletion removes the payment document and does not change loan balance. Regular payments do not show a delete action.

Color tokens:
Primary Blue #1565C0, Dark Navy #0D1B2A, Accent #1976D2, Light Tint #E3F2FD, Green #2E7D32, Red #C62828, Orange #C55A11, PhonePe Purple #5F259F, Card BG #F5F9FF, Text Secondary #546E7A.
