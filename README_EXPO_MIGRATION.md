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
