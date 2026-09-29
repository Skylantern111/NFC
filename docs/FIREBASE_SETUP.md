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
1. On **Admin → Settings → Admin signup passcode**, click **Generate** (8+
   characters), then **Set passcode**, and share it privately.
2. The new admin signs up at **`/admin/register`** with it, typing the
   email twice.
3. The database rules check the passcode. A wrong one creates no account.
4. The new admin lands on `/admin/verify-email` and has **no admin rights
   until they click the link** in the verification email
   (`docs/EMAIL_OWNERSHIP_PLAN.md` D1). Custom-claim admins
   (`scripts/setAdmin.js`) are exempt.
5. Click **Turn off** when nobody is being onboarded.

> **Before deploying the verified-admin rules** (first deploy after
> `EMAIL_OWNERSHIP_PLAN.md`): make sure at least one admin can still get
> in. Either run `scripts/setAdmin.js` for your own account (custom claim,
> exempt), or verify your passcode admin's email first. Otherwise every
> unverified passcode admin lands on the verify page at the next sign-in.
> Deploy rules and hosting together
> (`firebase deploy --only hosting,firestore:rules`), or unverified admins
> get a "no access" loop.

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

### Cleaning up wrong-email accounts

Someone who mistypes their email at sign-up can fix it on the verify page
("Wrong email? Change it"). Accounts left behind with a wrong address are
removed by hand — the app has no Cloud Functions (Spark plan), so it can't
delete Auth users itself. **Admin → Owners** marks accounts "Email not
verified"; one still unverified after 7 days is probably a typo.

1. **Authentication → Users:** find the wrong-email accounts and delete
   them. This deletes the sign-in only.
2. **Firestore → `users/{uid}`:** delete the same UIDs. For an owner that
   has tags, prefer **Admin → Owners → Disable account**, or release the
   tags first.
3. If the admin passcode may have leaked: **Admin → Settings → Admin
   sign-up passcode** → **Generate** to replace it, then **Turn off** until
   the next admin sign-up.

## 6. Recommended console settings

- **Restrict the web API key:** Google Cloud Console → APIs & Services →
  Credentials → Browser key → Website restrictions:
  - `https://<project>.web.app/*`
  - `https://<project>.firebaseapp.com/*`
  - `http://localhost:*/*`
- **Email enumeration protection:** Firebase Console → Authentication →
  Settings. Sign-in errors then stop revealing which emails exist.
- **Verification email delivery.** Owners must verify their email before
  claiming a tag, so this email has to arrive:
  - Authentication → Sign-in method: **Email/Password** enabled.
  - Authentication → Templates → **Email address verification**: set the
    sender name (e.g. "TagBack") and subject. Send a test to a real inbox.
  - Authentication → Settings → **Authorized domains** includes
    `<project>.web.app` (the email's "Continue" link returns there; without
    it the app sends the email with no continue link).
  - Mail from `noreply@<project>.firebaseapp.com` often lands in Gmail's
    Spam or Promotions. The verify page says so. For better delivery, set
    **Templates → Customize domain** to a domain you own (DNS records).
  - Firebase limits how often one account can be sent an email
    (`auth/too-many-requests`); the app waits 60 s between resends.
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

Run this right after every deploy (`DEPLOY.md`). The quick version is
steps 1–5. The **full pass** (all steps, with DevTools → **Console** open
the whole time) is also the check before switching the Content Security
Policy from report-only to enforced (`docs/SYSTEM_AUDIT_ROUND4.md` E2).
Copy any line that starts with `[Report Only]` or mentions
`Content-Security-Policy`.

1. **Admin:** Admin → NFC Register → register a sticker. Or, without NFC
   hardware, use **Admin → Settings → Developer tools → Register test tag**.
   Note the TagBack ID.
2. **Owner:** sign up at `/register` with a real inbox → the verify page
   opens → click the link in the email (check Spam) → back in the app it
   says "Email verified" within a few seconds → **Claim** that ID → it should appear
   on Dashboard and My Items → turn on Lost Mode.
3. **Finder:** open `/nfc/<TagBack ID>` in a private window → share
   location → file a report → send a chat message.
4. **Owner:**
   - The report card shows on the Dashboard, with a **map**.
   - The chat shows in Messages.
   - The alert shows in Notifications, and the tab title shows the unread
     count.
   - Reply in the chat → **Mark as recovered**.
5. **Admin:** Tag Content → edit the tag → reopen the finder link to see
   the change.

Full pass, continued:

6. **Profile card:** set the tag to *Profile card* → open the finder link
   → **Save contact** downloads a `.vcf`.
7. **Redirect:** set the tag to *Redirect*. The owner-set version shows
   the "You're leaving TagBack" page; the admin-set version is instant.
8. **Moderation:** report the chat from each side → Admin → Moderation
   shows both → **Ban token** / **Look up owner** / **Mark reviewed**.
9. **Owners page:** look up the tag's owner. **Settings:** set the admin signup passcode
   (Generate → Set) → sign up a second admin at `/admin/register` → then
   **Turn off**.
10. **Inventory:** ⋯ menu → Copy URL, Blacklist → the finder page says
    "no longer active" → Unblacklist.
11. **Errors:** Admin → Errors loads, empty or not.
12. **Release and delete:** owner → My Items → **Release tag**; then
    Settings → **Delete my account** (type DELETE + password) → you are
    signed out, and the account can't sign in again.
13. **Privacy page:** `/privacy` opens from the landing footer and signup.
14. **Email ownership** (`docs/EMAIL_OWNERSHIP_PLAN.md`):
    - Owner sign-up with two different emails is blocked at the form.
    - Owner signs up → on the verify page, **Change it** to another real
      inbox → click the new link → sign in with the new address → claim.
    - Admin signs up with the passcode → lands on `/admin/verify-email`,
      and gets no admin data before clicking the link → after the click,
      the page moves to Inventory within about 5 s.
    - An existing unverified passcode admin signs in → lands on the verify
      page, not on "no access". A custom-claim admin is unaffected.
15. **Real device (once per sticker model):** on an Android phone with
    Chrome over HTTPS:
    - Admin → NFC Register → **Start NFC scan** → tap a real NTAG sticker
      → Register → **Write NFC tag**.
    - Then, as an owner, **Claim** by tapping the sticker.
    - Then tap it with another phone (an iPhone too) → it opens the finder
      page.
