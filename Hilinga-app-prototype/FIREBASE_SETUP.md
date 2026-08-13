# Hilinga Firebase setup

The app uses Firebase Authentication, Cloud Firestore, and Cloud Storage.

## Enabled services

- Authentication: Email/Password and Google
- Firestore Database
- Storage

Under Authentication > Settings > Authorized domains, add every web hostname
that will run Hilinga. Add `localhost` for local web development if it is not
already listed, and add the production hostname before deployment.

The local Firebase web configuration belongs in `.env.local`; copy the variable
names from `.env.example`. Firebase web configuration identifies the project but
is not a server secret. Never add a service-account private key to the app.

## Security rules

Install the Firebase CLI, sign in, then deploy the checked-in owner-only rules:

```sh
firebase deploy --only firestore:rules,storage
```

Keep `VITE_FIREBASE_STORAGE_ENABLED=false` until the project's default Cloud
Storage bucket has been created and the Storage rules above have been deployed.
Then set it to `true` and restart the app. Profile setup still works while
Storage is disabled; selected photos are session-only until cloud uploads are
enabled.

Profiles are stored at `profiles/{uid}`. Shared business posts are stored at
`businessPosts/{postId}`, with their media under `business-posts/{uid}` in
Cloud Storage. Any authenticated user can read those posts and media, while
only the owning business account can create or delete them. Saved places and
trip plans are stored under `users/{uid}/savedPlaces/{placeId}` and
`users/{uid}/tripPlans/{planId}`. Firestore rules allow an authenticated user to
read and write only their own documents and validate the fields written by the
app. Avatars are stored below `avatars/{uid}` and are limited to authenticated
owners, image content, and 25 MB.

On the first signed-in launch after upgrading, Hilinga assigns existing local
saved places and trip plans to that authenticated account and uploads them. The
assignment is recorded on the device so the same legacy data is never offered
to a second account. New changes are written to a user-scoped IndexedDB cache
first; if Firestore is offline or times out, they stay queued locally and sync
on a later load. A successful cloud load refreshes that cache, making the same
data available on other devices.

The current Vite web build cannot open a native SQLite database directly. If a
native build previously stored these tables in SQLite, keep its existing
SQLite-to-web/local migration step in the upgrade path; once those rows reach
the local `saved_items` and `trip_plans` stores, the one-time cloud migration
above claims and syncs them safely.

After changing `firestore.rules`, deploy the rules before testing writes from a
client. No service-account credential or private key belongs in `.env.local`,
the web bundle, or this repository.

## Native Google sign-in

Web Google sign-in works through Firebase's popup flow. Android and iOS builds
also require platform OAuth client IDs from Google Cloud/Firebase:

```text
EXPO_PUBLIC_FIREBASE_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_FIREBASE_GOOGLE_IOS_CLIENT_ID=
```

Before creating those clients, set the final `android.package` and
`ios.bundleIdentifier` values in `app.json`. Add the corresponding SHA-1/SHA-256
certificate fingerprints for Android in Firebase Project settings.
