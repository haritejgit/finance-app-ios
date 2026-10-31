# Isolated Firebase QA setup

Use a separate Firebase project for owner workflow tests. Do not copy production customer, loan, payment, village, or wallet data into it.

## Create the test project

1. In the Firebase Console, create a new project with a clearly recognizable staging name. Do not add it to the production hosting target.
2. In **Project settings → Your apps**, register a Web app and copy its Firebase web configuration. These web app values are public client configuration, not server credentials.
3. In **Authentication → Sign-in method**, enable Email/Password. Add `localhost` to authorized domains if the Console does not already list it.
4. Create the Firestore database in a region of your choice. This database must remain empty of production data.
5. In **Authentication → Users**, create a disposable test owner, or use the app's sign-up form. Use a test-only email and password.

## Run the app against staging

Open a dedicated PowerShell window in the project folder. Set the following variables from the staging Web app configuration, substituting your staging project ID in both project ID variables:

```powershell
$env:EXPO_PUBLIC_FIREBASE_API_KEY = "<staging web app apiKey>"
$env:EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = "<staging project authDomain>"
$env:EXPO_PUBLIC_FIREBASE_PROJECT_ID = "<staging project ID>"
$env:EXPO_PUBLIC_FIREBASE_EXPECTED_PROJECT_ID = "<same staging project ID>"
$env:EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET = "<staging project storageBucket>"
$env:EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "<staging project messagingSenderId>"
$env:EXPO_PUBLIC_FIREBASE_APP_ID = "<staging web app appId>"
$env:EXPO_PUBLIC_AI_PROXY_ENABLED = "false"
npm run web
```

The project guard rejects a different project ID unless the expected ID is explicitly set too. The checked-in `.env.example` keeps the expected ID pinned to production. Keep test credentials and any local `.env` files out of Git. Do not run a Hosting deployment while the terminal contains staging configuration.

## Add staging security rules and indexes

From the project folder, deploy only the checked-in Firestore rules and indexes to the explicit staging project ID:

```powershell
firebase deploy --only firestore:rules,firestore:indexes --project <staging-project-id>
```

Never omit `--project` for this command. Do not deploy Functions or Hosting as part of this setup. The production Hosting site remains `karthikeya-finance` in project `finance-for-ios`.

After signing in with the disposable owner, create made-up villages, customers, loans, payments, investment plans, and expenses in staging. Exercise renewals with both fee options, reports/exports, the planner, and Cash Flow Radar. Delete the staging project when QA is complete if it is no longer needed.

To return the app to production locally, close the staging terminal and start a fresh terminal with the production `.env` values. Confirm `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_EXPECTED_PROJECT_ID` both equal `finance-for-ios` before building or deploying Hosting.
