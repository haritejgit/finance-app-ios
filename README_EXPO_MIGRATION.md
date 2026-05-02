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

### Firebase Hosting

`firebase.json` is configured to serve `dist/` with SPA fallback (Expo Router).

1. `npm run build`
2. `firebase deploy --only hosting`

Add your hosting domain under Firebase Console → Authentication → Settings → **Authorized domains**.

### Netlify

`netlify.toml` runs `npm run build` and publishes **`dist/`** (matches Netlify’s usual publish folder).

1. In Netlify → **Site configuration → Build & deploy**: set **Publish directory** to `dist` (or leave blank so `netlify.toml` applies). Remove any stale custom path that still says `web-dist`.
2. Connect the repo in Netlify **or** drag-drop the `dist` folder after a local `npm run build`.
2. Set the same `EXPO_PUBLIC_*` env vars in Netlify → Site settings → Environment variables.
3. Add your `*.netlify.app` URL to Firebase **Authorized domains**.

Reuse `.env` locally for builds; hosting providers need those variables at **build time** so Firebase initializes correctly in the bundle.
