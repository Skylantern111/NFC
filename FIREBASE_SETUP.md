# Backend Setup — Firebase (not MongoDB)

This app is built entirely against **Firebase** (Firestore + Firebase Auth)
— every data hook (`src/lib/*.js`), the security model (`firestore.rules`),
and the auth flow (`src/context/AuthContext.jsx`, `src/pages/admin/AdminLayout.jsx`)
assume Firestore's document/collection shape and Firebase Auth's ID-token
custom claims. There is no MongoDB (or any other DB) code anywhere in this
repo — `grep`ing for `mongo`/`mongoose` turns up nothing.

**MongoDB is not a drop-in alternative here.** Swapping it in would mean
rewriting, not configuring:
- Every `onSnapshot` live query (`lib/ownerItems.js`, `lib/moderation.js`)
  → a real-time layer of your own (Mongo has no built-in equivalent;
  you'd stand up Socket.io/WebSockets, or poll).
- All of `firestore.rules` — the whole PII-isolation model (see its file
  header) is enforced by Firestore's server-side rules engine. Mongo has
  no equivalent; enforcement would move into an API server you'd have to
  build, and the client could no longer talk to the database directly.
- Firebase Auth's ID-token custom claims (`token.claims.admin === true`,
  checked in `AdminLayout.jsx`) → your own auth/session/JWT system.
- `runTransaction` (`dashboard/ClaimTag.jsx`) → Mongo multi-document
  transactions (supported, different API) or a rethink of the claim flow.

If you actually want that rewrite, treat it as a new architecture, not a
config change, and come back for a real plan. Everything below sets up the
**real Firebase project** the existing code is already written for — this
is the fast, correct path to taking the app out of mock/preview mode.

---

## 1. Prerequisites

- A Google account.
- Node.js already installed (this repo's `package.json` needs it anyway).
- The Firebase CLI: `npm install -g firebase-tools`, then `firebase login`.

## 2. Create the Firebase project

1. Go to https://console.firebase.google.com → **Add project**. Name it
   whatever you like (e.g. `tagback` or `nfc-lost-and-found`) — the project
   ID doesn't need to match the repo name.
2. Google Analytics is optional — skip it unless you want it.

## 3. Register the web app

1. In the new project, click the **Web** icon (`</>`) to add a web app.
2. Give it a nickname (e.g. "TagBack web"). Firebase Hosting setup is
   optional here — skip unless you're deploying via Firebase Hosting.
3. Copy the `firebaseConfig` object it shows you — you'll need every field.

## 4. Fill in `.env`

```bash
cp .env.example .env
```

Paste the values from step 3 into `.env`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_PUBLIC_BASE_URL=http://localhost:5173
```

`src/firebase/config.js` flips `firebaseReady` to `true` the moment
`VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_PROJECT_ID` are both non-empty —
that's the flag every page/hook checks to switch from mock data to real
Firestore reads/writes. `.env` is gitignored; never commit it.

`VITE_PUBLIC_BASE_URL` is the domain written onto physical NFC tags
(`lib/tags.js#tagUrl`) — set it to wherever the app is actually hosted
before writing real tags; `localhost` only works for tags tapped on the
same machine.

## 5. Enable Firestore

Console → **Build → Firestore Database → Create database**.
- Pick **production mode** (not test mode) — this repo's `firestore.rules`
  is the real access-control layer, not a placeholder to replace later.
- Pick a region close to your users. This can't be changed later without
  recreating the database.

## 6. Enable Authentication

Console → **Build → Authentication → Get started → Sign-in method →
Email/Password → Enable**. This is the only provider the app uses
(`Login.jsx`/`Register.jsx`).

## 7. Deploy the security rules

The rules already exist in this repo at `firestore.rules` — deploy them
rather than hand-editing anything in the console:

```bash
firebase login
firebase init firestore   # pick the existing project; when it asks for a
                           # rules file, point it at ./firestore.rules
                           # (don't let it overwrite your rules file with
                           # a template — say no if prompted)
firebase deploy --only firestore:rules
```

If you'd rather not run `firebase init` interactively, paste the contents
of `firestore.rules` directly into Console → Firestore Database → Rules →
publish.

Re-run `firebase deploy --only firestore:rules` any time `firestore.rules`
changes — nothing in the app deploys rule changes automatically.

## 8. Composite indexes (only if Firestore asks for one)

Most of this app's queries are single-field `where`/`in` reads that need
no configuration. The one query combining two conditions —
`lib/ownerItems.js#useOwnerOpenReports` (`where('tagId','in',...)` +
`where('status','==','open')`) — may prompt Firestore for a composite
index the first time it actually runs against your project. If so,
Firestore's error message includes a direct console link that
auto-creates the exact index needed; click it once, wait for it to finish
building, and the query starts working. No manual index file is checked
into this repo (`firebase.json`/`firestore.indexes.json` don't exist yet)
— add one with `firebase firestore:indexes > firestore.indexes.json` if
you want the index checked into source control after creating it.

## 9. Grant yourself admin access

`/admin/*` is gated on a Firebase Auth **custom claim** (`admin: true`),
checked in `AdminLayout.jsx`. It cannot be set from the client — use the
provided script:

1. Register a normal account first (`/register`) so the user exists.
2. Console → Project settings → **Service accounts** → **Generate new
   private key** → save the JSON somewhere outside this repo (never
   commit it).
3. Run:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
     node scripts/setAdmin.js you@example.com
   ```
4. Sign out and back in on the site — custom claims only take effect on a
   fresh ID token.

## 10. Run it for real

```bash
npm install
npm run dev
```

With `.env` filled in, `firebaseReady` is `true` and every page switches
from its mock fixtures to live Firestore. Good end-to-end smoke test:
register an account → claim a tag (`/dashboard/items/claim`, any string as
a manual tag ID works for testing even without a real NFC sticker, since
`tags/{tagId}` doesn't need to pre-exist for a fresh claim in dev — see
`ClaimTag.jsx`'s transaction) → open that tag's public URL
(`/nfc/:tagId`) in a private/incognito window to act as the "finder" →
file a found report → confirm it shows up live in `/dashboard`,
`/dashboard/messages`, and `/dashboard/notifications` for the owner
window.

## 11. Admin claim provisioning tags (optional)

`admin/Inventory.jsx`'s batch-provisioning flow writes directly to
`tags/{tagId}` from the client, which `firestore.rules` only allows for
`isAdmin()` — so it only works once you've completed step 9.
