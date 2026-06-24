# Nested Account Web App

A standalone temporary web app for managing nested/sub-accounts for your Finance Manager.

## Why this exists

When you go on vacation, someone else needs to handle collections. But you don't want them to see your expenses, investments, or account balances. This app gives them **restricted access** to only what they need.

## Setup

### 1. Set up Firebase Config

Copy your Firebase config from your main project:

1. Open `nested-account/firebase-config.js`
2. Replace the config values with your own from Firebase Console → Project Settings → Web App
3. These values are the same as your `EXPO_PUBLIC_FIREBASE_*` environment variables

### 2. Deploy Firestore Rules

The file `firestore.rules` in the project root has already been updated. You must deploy it:

```bash
firebase deploy --only firestore
```

This allows nested users to read your main data while still being secure.

> **Composite Index Required** — The `nestedPayments` collection uses `orderBy('createdAt', 'desc')` 
> combined with `where('masterUserId', ...)`. Firebase will prompt you to create this index 
> automatically when you first run the Admin page. Click the link in the error message 
> or create it manually:
> - Collection: `nestedPayments`
> - Fields: `masterUserId` (Ascending), `createdAt` (Descending)
> - Same for `nestedUserId` + `createdAt`

### 3. Create a Nested Account

**For the main user (you):**

1. Open `nested-account/index.html` in your browser
2. Click **"Admin — Create Nested Account"** on the login page
3. Sign in with **your** email/password
4. Enter the nested person's email (they need a Firebase Auth account first — click "New user? Create account" to register them)
5. Add a label (e.g. "Suresh - Vacation Relief")
6. Click Create

### 4. The Nested Person Logs In

1. First time? Click **"New user? Create account"** to sign up with their email & password
2. The nested person opens `nested-account/index.html` in their browser
3. They log in with **their own** email/password
4. The app automatically detects they're a nested user (via the email you registered) and shows the **Nested Dashboard**
5. They can:
   - View villages and customers
   - Record payments (Cash or PhonePe)
   - Mark customers as Due
   - View customer history
   - **Export** all recorded payments as Excel

### 5. After Vacation

1. The nested person clicks **"Export Nested Payments"**
2. They download an Excel file with all payments they recorded
3. They send it to you
4. You **manually enter** those payments into your main Finance Manager app
5. (Optional) Delete the nested account via the Admin view

## What's Hidden (Nested User Cannot See)

- ❌ Expenses
- ❌ Investments
- ❌ Account balances / Wallet
- ❌ Analytics / Graphs
- ❌ Settings
- ❌ Balancing Fund
- ❌ Account Notes

## File Structure

```
nested-account/
├── README.md           # This file
├── index.html          # The main app (single page, all-in-one)
└── firebase-config.js  # Your Firebase configuration
```

## How it Works

- Reads data using **your** userId (via the `nestedAccounts` mapping)
- Writes payments to the **`nested_payments`** collection (separate from main payments)
- Exports `nested_payments` as Excel
- Your main data is never modified by the nested user
