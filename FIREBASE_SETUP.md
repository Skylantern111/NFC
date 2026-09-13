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

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDDg-HLaRDKROVyGaYmd19nOlM_UTaOgfE",
  authDomain: "nfc-lost-and-found.firebaseapp.com",
  projectId: "nfc-lost-and-found",
  storageBucket: "nfc-lost-and-found.firebasestorage.app",
  messagingSenderId: "794952274469",
  appId: "1:794952274469:web:14f6baf583dd648a2a65cc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

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

**Common mistake:** the web-app registration screen (step 3) shows a whole
JS snippet (`import { initializeApp } from "firebase/app"; ...`) — don't
paste that snippet itself into `.env`. `.env` needs the individual
`VITE_FIREBASE_*` values pulled out of that snippet's `firebaseConfig`
object, one per line as `KEY=value` (Vite doesn't parse JS, only
`KEY=value` pairs) — copy each field across as shown above, not the
surrounding code.

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
changes — nothing in the app deploys rule changes automatically. If you
already deployed rules before:
- `firestore.rules` gained a `tags/{tagId}` `update` clause (the claim flow
  now flips `status: unclaimed → claimed`) — redeploy to pick it up, or
  claiming will fail with a permission error.
- It later gained admin read on `itemOwners`/`users` (for `admin/Owners.jsx`'s
  lookup), a `users/{uid}.disabled` soft-disable field an admin can set,
  blacklisted-tag enforcement on `reports`/`chats`/`chats/messages` `create`,
  and an admin-only `reviewedAt`/`reviewedBy` update on `chats` (for
  `admin/Moderation.jsx`'s "Mark reviewed"). Redeploy to pick these up too —
  without them, `admin/Owners.jsx` can't read anything, blacklisting a
  claimed tag stays purely cosmetic (see below), and "Mark reviewed" fails
  with a permission error.
- IMPROVEMENT_PLAN.md Round 12's admin additions (disable-account reason
  fields, bulk-blacklist, bulk-mark-reviewed) need **no** rules redeploy —
  `users/{uid}`'s and `tags/{tagId}`'s admin-write clauses are already
  unconditional for `isAdmin()`, with no field allowlist to update.
- Round 14's passcode-gated admin signup **does** need a redeploy —
  `isAdmin()` now also accepts a `users/{uid}.isAdmin` field (not just the
  custom claim), and the `users/{uid}` self-`update` rule now blocks
  changing `isAdmin` the same way it already blocked `disabled`. As of this
  writing that change has **not** been deployed from this environment (no
  `firebase login`/`.firebaserc` here) — a passcode-registered admin's
  `/admin/*` reads/writes will get `permission-denied` until it is.
- Round 15's stale-nudge cross-device sync (`users/{uid}.staleNudgeDismissed`)
  needs **no** redeploy — self-update on `users/{uid}` is already open to
  any field except `disabled`/`isAdmin`.

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
4. Sign in at **`/admin/login`** — a dedicated admin lock screen, separate
   from the owner `/login` — with that account. Custom claims only take
   effect on a fresh ID token, so if you were already signed in elsewhere,
   sign out first. `/admin/login` checks the claim immediately after
   sign-in and signs a non-admin account back out rather than leaving it
   in a signed-in-but-unauthorized state; visiting any `/admin/*` route
   while signed in as a non-admin also bounces here, with a notice
   explaining why.

This same claim gates all of `/admin/*` — Inventory, Moderation, and Owners
(`admin/Owners.jsx`, the tag → owner lookup that can also disable an owner's
account). There's no Cloud Functions/Admin SDK wired into this project, so
that "disable account" button is a **soft** disable
(`users/{uid}.disabled`), not a real Firebase Auth account disable — it
blocks every owner-gated Firestore read/write app-wide (`firestore.rules`'
`ownsTag()` checks it) and force-signs-out an already-open session
client-side (`AuthContext.jsx`), but it can't revoke a still-valid ID token
server-side the way `scripts/setAdmin.js`'s custom claim can. If you add a
Cloud Function later, disabling a Firebase Auth user directly (and revoking
their refresh tokens) is the harder, actually-enforced version of this.

## 10. Run it for real

```bash
npm install
npm run dev
```

With `.env` filled in, `firebaseReady` is `true` and every page switches
from its mock fixtures to live Firestore — `Dashboard.jsx`, `Items.jsx`,
`Messages.jsx`, `Notifications.jsx`, and `Chat.jsx` all read/write through
`lib/ownerItems.js`'s live hooks now (no more separate `localStorage` mock
layer — that was removed with `lib/api.js`/`lib/seedData.js`).

`tags/{tagId}` **must already exist** before it can be claimed — either
provisioned by an admin (`/admin/inventory`, step 11 below) or created by
hand in the Firestore console with `{ status: 'unclaimed' }`. `ClaimTag.jsx`
throws "Tag not found" for an id with no `tags/{tagId}` doc, by design (it's
provisioning inventory, not a free-for-all).

Good end-to-end smoke test:
1. Provision a tag as admin (§11), or create one by hand: `tags/test-tag-1`
   = `{ status: 'unclaimed', batchNumber: 0, createdAt: <any number> }`.
2. Register an account → claim it at `/dashboard/items/claim` (paste
   `test-tag-1` as the tag id — a physical tap or Web NFC scan works too,
   see `ClaimTag.jsx#scanNfc`). Confirms `tags/test-tag-1.status` flips to
   `claimed` (admin Inventory's counts will reflect it).
3. Open `/nfc/test-tag-1` in a private/incognito window to act as the
   finder → file a found report.
4. Confirm it shows up live in `/dashboard` (hero incident card), owner's
   `/dashboard/messages`, and `/dashboard/notifications` in the original
   window — then open the chat and try "Mark as recovered" from the owner
   side.

## 11. Admin console features (optional)

`admin/Inventory.jsx`'s batch-provisioning flow writes directly to
`tags/{tagId}` from the client, which `firestore.rules` only allows for
`isAdmin()` — so it only works once you've completed step 9. The same is
true of `admin/Owners.jsx`'s lookup (needs the admin-read rules on
`itemOwners`/`users` from step 7) and `admin/Moderation.jsx`'s ban/mark-
reviewed actions.
