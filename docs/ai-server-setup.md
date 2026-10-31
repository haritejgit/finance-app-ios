# Secure AI provider setup

The Gemini and Anthropic API keys must be stored as Firebase Function secrets. Do not put them in `EXPO_PUBLIC_*` variables, app configuration, or source control. The app's AI callables require a signed-in Firebase user, bound prompt sizes and chat history, and send only aggregate business metrics without customer identifiers, names, phone numbers, or village names.

Before deploying the AI callables, [enable the Secret Manager API for this Firebase project](https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=finance-for-ios). Then, from a trusted terminal, enter each key at the Firebase CLI prompt:

```powershell
firebase functions:secrets:set GEMINI_API_KEY --project finance-for-ios
firebase functions:secrets:set ANTHROPIC_API_KEY --project finance-for-ios
```

Deploy the callables after both secrets have been configured:

```powershell
firebase deploy --only functions:generateGemini,functions:generateAnthropic --project finance-for-ios
```

Then rebuild and publish Hosting:

```powershell
npm run build
firebase deploy --only hosting:app --project finance-for-ios
```

Set `EXPO_PUBLIC_AI_PROXY_ENABLED=true` in the trusted build environment only after both callables have deployed. Until then, both AI screens stay in setup mode and do not submit requests.

If either provider key was previously included in a client build, rotate that key with its provider before adding the replacement to Firebase Secret Manager.
