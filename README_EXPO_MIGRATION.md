# Expo iOS Migration Notes

## Run Locally

1. Copy `.env.example` to `.env` and fill Firebase values.
2. Install dependencies:
   - `npm install`
3. Start project:
   - `npx expo start`

## iOS Build (EAS)

1. Login to Expo:
   - `npx eas login`
2. Configure project:
   - `npx eas init`
3. Build preview or production:
   - `npx eas build -p ios --profile preview`
   - `npx eas build -p ios --profile production`
4. Submit to App Store:
   - `npx eas submit -p ios --profile production`

## Implemented Routes

- `/login`
- `/shift-selection`
- `/village/[day]/[shift]`
- `/customer/[villageId]`
- `/profile/[customerId]`
- `/reports`
- `/settings`

## Firebase Rules + Indexes

This repo now includes:

- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`

If you have Firebase CLI installed, deploy both with:

- `firebase login`
- `firebase use <your-project-id>`
- `firebase deploy --only firestore`

## Web export (phone browser, no Expo Go)

Build static files into `dist/`:

- `npm run build` (same as `npm run export:web`)

### Firebase Hosting (recommended with Firebase Auth/Firestore)

`firebase.json` serves **`dist/`** with SPA rewrites to **`index.html`** (Expo Router).

**One-time setup**

1. In [Firebase Console](https://console.firebase.google.com/) → Project settings, copy your **Project ID**.
2. Copy `.firebaserc.example` to `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with that ID  
   (or run `firebase use --add` after login — it creates `.firebaserc`).
3. Enable **Hosting** for the project if prompted the first time you deploy.

**Deploy the web app**

1. Ensure `.env` has all `EXPO_PUBLIC_*` keys (they are baked in at build time).
2. From the project root:
   - `npm install`
   - `npm run deploy:hosting`  
     (runs `npm run build` then `firebase deploy --only hosting`)

**Deploy Firestore rules/indexes + Hosting together**

- `npm run deploy:firebase`

**After deploy**

- Firebase gives you a URL like `https://<project-id>.web.app` / `firebaseapp.com`.
- Add that domain under **Authentication → Settings → Authorized domains**.
- For Google sign-in on the web, ensure OAuth/Web client settings allow your hosting origin.

### Netlify

`netlify.toml` runs `npm run build` and publishes **`dist/`** (matches Netlify’s usual publish folder).

1. In Netlify → **Site configuration → Build & deploy**: set **Publish directory** to `dist` (or leave blank so `netlify.toml` applies). Remove any stale custom path that still says `web-dist`.
2. Connect the repo in Netlify **or** drag-drop the `dist` folder after a local `npm run build`.
3. Set the same `EXPO_PUBLIC_*` env vars in Netlify → Site settings → Environment variables.
4. Add your `*.netlify.app` URL to Firebase **Authorized domains**.

Reuse `.env` locally for builds; hosting providers need those variables at **build time** so Firebase initializes correctly in the bundle.
