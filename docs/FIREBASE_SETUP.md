# Firebase Setup

How to connect this app to a real Firebase project, deploy it, and create
the first admin. The live project is `nfc-lost-and-found`
(https://nfc-lost-and-found.web.app); follow the same steps for a new one.

The app is built for **Firebase only** (Firestore + Auth + Hosting). Live
queries (`onSnapshot`), the privacy model in `firestore.rules`, Auth custom
claims and transactions all depend on it. Moving to another database
would be a rewrite, not a configuration change.

Everything below runs on the free **Spark** plan. Nothing here needs Cloud
Functions or billing.

---

## 1. Prerequisites

- A Google account and Node.js.
- Firebase CLI: `npm install -g firebase-tools`, then `firebase login`.
- Java, for the local Firestore emulator that `npm test` uses.
- npm on HTTPS: `npm config get registry` should print
  `https://registry.npmjs.org/`.

## 2. Create the project and the web app

1. https://console.firebase.google.com → **Add project** (Analytics
   optional).
2. Click the **Web** icon (`</>`) → register a web app → copy the values
   from the `firebaseConfig` object it shows.
3. **Build → Firestore Database → Create database**, in **production
   mode**. `firestore.rules` is the real access-control layer. The region
   can't be changed later; this project uses `asia-northeast1`.
4. **Build → Authentication → Sign-in method → Email/Password → Enable.**
   It is the only provider the app uses.

## 3. Fill in `.env`

```bash
cp .env.example .env
```

Put each `firebaseConfig` value on its own line. Paste the values only, not
the JS snippet:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

- `firebaseReady` turns on (live data instead of mock data) once the API
  key and project ID are set.
- `.env` is git-ignored.
- `VITE_PUBLIC_BASE_URL` is optional. The URL written onto stickers
  defaults to the site's own origin (`lib/tags.js#tagUrl`); set it only to
  write a different domain.

## 4. Deploy

Point the CLI at the project (`firebase use <project-id>`, or a
`.firebaserc`), then:

```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

This deploys:
- **`firestore.rules`:** all access control.
- **`firestore.indexes.json`:** the composite index for the notifications
  feed (`tagId` + `createdAt` desc). A new index takes a few minutes to
  build (Console → Firestore → Indexes). The feed is empty until then.
- **Hosting (`dist/`),** with headers from `firebase.json`:
  - `no-cache` for pages
  - one-year caching for `/assets/*`
  - security headers
  - a report-only CSP

Always deploy the three together. The app and the rules change in step.

## 5. Create the first admin

There are no admins yet, so use the custom-claim script once:

1. Sign up a normal account at `/register`.
2. Console → Project settings → **Service accounts → Generate new private
   key**. Save the JSON **outside** the repo. `.gitignore` also ignores
   `*service-account*.json` and `*-firebase-adminsdk-*.json`, but keep it
   out of the repo anyway.
3. Run:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
     node scripts/setAdmin.js you@example.com
   ```
4. Sign out, then sign in at **`/admin/login`**.

Further admins can then sign up themselves:
1. On **Admin → Owners → Admin signup passcode**, click **Generate** (8+
   characters), then **Set passcode**, and share it privately.
2. The new admin signs up at **`/admin/register`** with it.
3. The database rules check the passcode. A wrong one creates no account.
4. Click **Turn off** when nobody is being onboarded.

Other admin scripts (same `GOOGLE_APPLICATION_CREDENTIALS`):
- `scripts/listSelfServeAdmins.js`: list passcode-created admins.
- `scripts/revokeSelfServeAdmin.js <uid-or-email>`: remove one.
- `scripts/setAdminSignupPasscode.js <passcode> | --off`: set or clear the
  passcode without the app.

To disable an abusive account, use **Admin → Owners → Disable**. It is a
soft disable (`users/{uid}.disabled`):
- every owner and admin rule refuses the account
- an open session is signed out
- Firebase Auth sign-in itself isn't revoked; that needs a backend

## 6. Recommended console settings

- **Restrict the web API key:** Google Cloud Console → APIs & Services →
  Credentials → Browser key → Website restrictions:
  - `https://<project>.web.app/*`
  - `https://<project>.firebaseapp.com/*`
  - `http://localhost:*/*`
- **Email enumeration protection:** Firebase Console → Authentication →
  Settings. Sign-in errors then stop revealing which emails exist.
- **Firebase App Check** (free): the next step against finder-side abuse
  (fake reports, notification spam). Not wired into the app yet.

## 7. Backups (free plan)

Managed backups and point-in-time recovery need the Blaze plan. Instead:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  node scripts/exportFirestore.js
```

This writes every collection and subcollection to `backups/<timestamp>/`
as JSON. The folder is git-ignored, and it contains private data, so keep
it safe.

## 8. Tests

```bash
npm test
```

Runs the rules tests and the end-to-end flow replay
(`tests/flows.test.js`) on a local emulator. Nothing touches the real
project. If it fails with "port taken", an emulator is already running on
port 8080: stop it, or run `npx vitest run` to use it.

## 9. Smoke test after a deploy

1. **Admin:** Admin → NFC Register → register a sticker. Or, without NFC
   hardware, use the "Development fallback" shown on non-NFC browsers.
   Note the TagBack ID.
2. **Owner:** sign up at `/register` → **Claim** that ID → it should appear
   on Dashboard and My Items → turn on Lost Mode.
3. **Finder:** open `/nfc/<TagBack ID>` in a private window → file a report
   → send a chat message.
4. **Owner:**
   - The report card shows on the Dashboard.
   - The chat shows in Messages.
   - The alert shows in Notifications, and the tab title shows the unread
     count.
   - Reply in the chat → **Mark as recovered**.
5. **Admin:** Tag Content → edit the tag → reopen the finder link to see
   the change.
