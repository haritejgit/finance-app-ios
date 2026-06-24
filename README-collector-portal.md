# Collector Portal (Nested Collector Account) Guide

The **Collector Portal** is a minimal, secure, and mobile-friendly web application located in `/nested-account` that allows a temporary collection assistant ("the collector") to view customer lists, view GPS coordinates with location details, access Google Maps directions, view read-only payment timelines, and log new collection payments (Cash or PhonePe) and dues.

---

## 🔒 Security & Separation Design

1. **Explicit Data Separation**: All entries logged by the collector are written only to the `nestedPayments` collection (tagged with `enteredBy` and `sessionId`). They do **not** automatically merge into the main database `payments` or impact live Accounts totals or Analytics.
2. **Server-Side Security**: Enforced via Firestore Security Rules. A user with the custom Auth claim `role: "collector"` is allowed read access to `customers`, `loans`, `payments`, and `villages` of their linked master user, and read+write access to their own `nestedPayments` only. They are **explicitly blocked** from reading `balancingFund`, `investments`, `expenses`, or `users` (profiles).
3. **Custom Claims Restriction**: The Collector Portal will block access and show an warning banner unless the custom auth claim `role: "collector"` is present.

---

## 🚀 Setup & Deployment Workflow

### Step 1: Deploy Firestore Security Rules
Deploy the updated security rules to enforce role-based access:
```bash
firebase deploy --only firestore
```

### Step 2: Deploy the Collector App Hosting Site
The app is configured as a secondary hosting site target named `nested` in `firebase.json` and `.firebaserc`. Deploy it using:
```bash
firebase deploy --only hosting:nested
```
Once deployed, it will be available at your second hosting URL (e.g., `https://karthikeya-finance-nested.web.app`).

---

## 👥 Assistant Setup & Custom Claims

To grant an assistant access to the Collector Portal:

### 1. Register the assistant's account
1. Open the Collector Portal login page.
2. Click **"New user? Create account"** and enter the assistant's email and password to create their Firebase Auth identity.
3. Keep a note of their **UID** (visible in the Firebase Console → Authentication).

### 2. Link the account as Nested
1. The Owner logs into the Collector Portal login page and clicks **"⚙️ Admin"** (requires owner credentials).
2. Under **"Create Nested Account"**, enter the assistant's email and a label (e.g. `Suresh - Vacation 2026`).
3. Click **"Create Nested Account"**.

### 3. Assign the Collector Custom Claim
Since Firebase Auth custom claims can only be set securely server-side:
1. Go to the Firebase Console, navigate to **Project Settings → Service Accounts**, and click **"Generate New Private Key"**.
2. Save the downloaded JSON file as `service-account-key.json` and place it inside the `functions` folder.
3. Open your terminal in the project root and run:
   ```bash
   node functions/set-collector-claim.js <assistant-uid>
   ```
4. This script will assign `role: "collector"` to the assistant. They can now log in and access the Collection Dashboard!

---

## 🎛️ Session & Reconciliation Workflow

### During the Vacation
1. The collector logs into the Collector Portal on their phone.
2. They select a Village, click on a Customer to view location/map directions and payment history, and record collections or mark them as due.
3. Every payment is logged to `nestedPayments` with `sessionId: "vacation_session"`.

### After the Vacation (Reconciliation)
1. In the Collector Portal under the **Export** tab, the collector clicks **"📥 Export as Excel"** to download the `nested_payments_YYYY-MM-DD.xlsx` file.
2. The collector sends this file to the Owner.
3. The owner reviews the Excel file:
   - **Excel Columns**: `Date`, `Customer name`, `Customer ID`, `Customer location` (GPS + Desc), `Amount`, `Mode of payment`, `Notes`, `Entered by`, `Timestamp`.
4. The owner manually keys the validated payments into the main app to update the live accounts and analytics.
5. Once reconciled, the owner goes to **⚙️ Admin → Active Nested Accounts** and clicks **"Remove"** on the assistant's entry to immediately revoke all read/write privileges.
