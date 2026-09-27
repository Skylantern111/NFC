# System Audit — Round 4

Status: **implemented in code** (2026-09-27) except the items that need you (A1 merge, E2 live pass) and A3 (staging, postponed) — see "Implementation status" at the end. Date: 2026-09-27.
Code audited: branch `tag-content-security-audit` at `7e4036c`, the version
live on https://nfc-lost-and-found.web.app.

**Baseline:**
- `npm test`: 89/89 pass (rules tests + the `tests/flows.test.js` replay).
- `npm run build`: clean (entry bundle 892 kB).

Rounds 1–3 covered rules, main flows and code bugs, and each fix is now
covered by a test. So this round looks at areas the earlier rounds didn't:
- release process
- data integrity of admin-facing fields
- privacy and data lifecycle
- dependencies
- operations (monitoring, staging, CI)

Severity:
- **High:** can undo security fixes or mislead admins in a way that matters.
- **Medium:** a real gap in operations, privacy or reliability.
- **Low:** hygiene.

---

## A. Release process

### A1 [High] `main` is 23 commits behind production
Production runs `tag-content-security-audit`. `main` was last updated on
2026-09-04, and the pull request isn't merged. Anyone who clones `main`,
or deploys from it (`firebase deploy` from a fresh checkout), would put
back **every fixed hole** on the live site:
- self-granted admin (Round 1 A1)
- tag squatting (A3)
- public listing of all tags (Round 2 A1)
- both "owners blocked" bugs

The rules deploy is global and instant, so there is no rollback safety.
**Fix:** merge the pull request into `main` now, and deploy only from
`main` from then on (see A3).

### A2 [Medium] No CI: tests run only when someone remembers
There is no `.github/workflows`. The 89 tests caught two production
outages after the fact, but nothing runs them on a push or pull request.
**Fix:** a GitHub Actions workflow on push and pull requests:
1. set up Node and Java 17+
2. `npm ci`
3. `npm run build`
4. `npm test` (the Firestore emulator runs inside the job)

The job is free for this repo size.

### A3 [Medium] Every deploy goes straight to production
There is one Firebase project (`.firebaserc` → `nfc-lost-and-found`) and
no preview step. Rules changes are especially risky: the two outages (A0
and A1 in Rounds 2–3) were rules deploys.
**Fix (free):**
- **Hosting:** preview on a temporary channel first
  (`firebase hosting:channel:deploy preview`).
- **Rules:** a second free Firebase project as **staging**
  (`firebase use --add` → `staging`). Deploy there, run the smoke test
  from `docs/FIREBASE_SETUP.md` §9, then deploy to production.

---

## B. Data integrity

### B1 [Medium] The email admins see can be faked
`users/{uid}.email` is written by the client, at signup and by any later
self-update, and `firestore.rules` doesn't check it against the real Auth
email. The admin console shows this field:
- **Owners** lookup header: `owner.email`
- **Inventory** "Reveal owner": `lookup.owner.email`

So an owner can set any email, e.g. another person's or `admin@…`. The
admin then investigates, disables or contacts the wrong identity.
**Fix:**
- In the rules, on create and update:
  `!('email' in request.resource.data) || request.resource.data.email == request.auth.token.email`
- Or stop storing `email` and show the Auth email instead (needs Admin
  SDK), or label the field "self-reported".

### B2 [Low] Inventory search needs the exact TagBack ID format
`Inventory.jsx` searches the server with `term.toUpperCase()`. A pasted ID
without dashes or with spaces (`tbabcd2345`) finds nothing, while Owners
and Tag Content accept it (`normalizeTagbackId`).
**Fix:** normalize with `normalizeTagbackId` before the `tagId` query.

---

## C. Privacy and data lifecycle

### C1 [Medium] Users can't delete their account or data
- Rules forbid deleting `users/{uid}` (correct since Round 1 A1).
- There is no "delete my account" flow, and no data export.
- Owners' items, profiles, chats and the finder reports on their tags stay
  forever unless each tag is released.
- Finders can't remove their reports or messages at all.

(Data export and deletion was listed as planned in `REDESIGN_PLAN.md`.)
**Fix, free, no backend:** Settings → "Delete my account":
1. release every tag (the existing `releaseTag` clean-up)
2. blank the profile doc (`deleted: true`, clear `phone`/`displayName`)
3. `deleteUser()` in Firebase Auth

Also add a short privacy note saying what is kept and for how long.

### C2 [Low] Phone number is collected but never used
Settings asks for a private phone number (`users/{uid}.phone`). Nothing
reads it: there is no SMS path, and it is never shown to finders. Storing
personal data with no purpose is avoidable risk.
**Fix:** remove the field, or state what it is for.

### C3 [Low] Finder reports keep exact GPS forever
`reports.location` keeps full-precision `lat`/`lng` indefinitely. It is
only removed when the owner releases the tag.
**Fix:** round to about 4 decimals (roughly 11 m) at write time, and/or
delete `location` when the report is resolved (`markRecovered`).

### C4 [Low] Finder token can link one finder across chats
A finder's session token is stored on every chat and finder message
(public by chat ID). An owner who receives two chats from the same
finder, on different items, sees the same token. The token also lets the
owner post as the finder in that chat (known limitation, `README.md`).
**Fix (partial, no backend):** a new random token per chat, kept in
`localStorage` keyed by chat ID. Real fix: App Check or finder accounts.

### C5 [Low] Chat and admin pages can be indexed by search engines
There is no `robots.txt` and no `noindex`. A chat link pasted somewhere
public could be crawled, and chat pages show the conversation to anyone
with the link.
**Fix:**
- `public/robots.txt` disallowing `/chat/`, `/dashboard/` and `/admin/`
- plus an `X-Robots-Tag: noindex` header for those paths in
  `firebase.json`

---

## D. Dependencies

### D1 [Low] 10 moderate `npm audit` advisories
- **`react-router-dom` 6.x (2, used in the app):** open redirect via a
  backslash in `<Link>`/`navigate`, and an SSR-only issue. This app only
  navigates to internal paths, so the impact is low. The fix is
  react-router 7 (major upgrade).
- **`firebase-admin` 13 chain (8):** `uuid`, `google-gax`, `teeny-request`
  and others. This is a **devDependency** used only by the local
  `scripts/`, so it's not in the shipped bundle. The fix is `firebase-admin`
  14 (major). The scripts use only basic APIs, so the upgrade is likely a
  drop-in.

**Fix:** upgrade `firebase-admin` to 14 now (dev-only, low risk); plan the
react-router 7 upgrade separately.

---

## E. Operations and verification

### E1 [Medium] No error monitoring
`ErrorBoundary`/`RouteErrorBoundary` only log to the browser console. A
crash on a finder's phone is invisible; the two production outages were
found by audit, not by an alert.
**Fix (free):** Firebase Crashlytics has no web SDK. Two options:
- Sentry's free tier: an external service; add its host to the CSP.
- A minimal in-project `clientErrors` collection:
- rules: create-only, size-bounded, admin-read
- the error boundaries write to it
- a small admin view lists recent errors

### E2 [Medium] Several things have never been checked on a real device or live
- **The report-only CSP (Round 3 B1)** has not been checked for violations.
  Until someone clicks through every page with DevTools open, it can't be
  enforced.
- **Web NFC registration and tap-to-claim** have not been checked on a
  physical Android + NTAG sticker (earlier `README` TODO).
- **The owner flows fixed in Round 3** (Dashboard, Messages, chat replies)
  pass in the emulator but have not been checked on the live site.

**Fix:** a one-time manual pass with a short checklist (in
`docs/FIREBASE_SETUP.md` §9), then enforce the CSP.

### E3 [Low] Free-tier quota not monitored
The Spark plan allows 50k document reads/day. Owners' pages hold several
live listeners (items and tag status per tag, chats, notifications, chat
previews). Past the quota the app stops reading until the daily reset,
with no warning.
**Fix:** set a Firebase Console usage alert, and check Firestore usage
after a real pilot week.

### E4 [Low] Duplicate `itemOwners` listeners per page (code, not cost)
Each owner hook (`useOwnerItems`, `useOwnerChats`, `useOwnerNotifications`,
`useOwnerTagIds`) opens its own `itemOwners` listener. The Dashboard mounts
four. The Firestore SDK shares identical queries, so billing isn't
multiplied, but the code repeats itself and each copy can briefly
disagree.
**Fix:** one `OwnerTagIdsProvider` context in `DashboardLayout`, used by
all hooks.

---

## F. Suggested fix order

1. **A1**: merge the pull request into `main`, and deploy only from `main`.
2. **A2**: CI running build and tests on every push and pull request.
3. **B1**: rules check on `users.email` (spoofable identity in the admin
   console).
4. **E2**: live checklist pass, then enforce the CSP.
5. **C1**: account deletion; **A3**: staging project; **E1**: error log.
6. The Low items as convenient (**D1** `firebase-admin` 14, **C5**
   robots, **B2**, **C2–C4**, **E3–E4**).

---

## Implementation status

Decisions: `SYSTEM_AUDIT_ROUND4_IMPLEMENTATION_PLAN.md` §Decisions.

| Item | Status |
|---|---|
| A1 | **Needs you:** merge the PR into `main` on GitHub (fast-forward, no conflicts) and turn on branch protection. `DEPLOY.md` now says: deploy only from `main`. |
| A2 | Done: `.github/workflows/ci.yml` runs build + tests on every push and PR; `firebase-tools` is now a devDependency, so CI doesn't need a global install. |
| A3 | **Postponed** (decision 4). |
| B1 | Done: rules require `users.email` to equal the sign-in email (on create and on change); signup stores the login's normalized email; the admin console labels it "Sign-up email"; `scripts/listEmailMismatches.js` finds old spoofed values. |
| B2 | Done: Inventory search normalizes the TagBack ID. |
| C1 | Done: Settings → **Delete my account** (full deletion, decision 2). Rules: own profile deletable unless disabled; ownership of a blacklisted tag can be dropped; Unblacklist restores an ownerless tag to `registered`. `/privacy` page. |
| C2 | Done: the phone field is gone; an old stored value is cleared when Settings opens. |
| C3 | Done: GPS rounded to 4 decimals (about 11 m) before saving; location and location note cleared when the report is resolved. |
| C4 | **Not doing** (decision 1): it would weaken admin bans. Documented in `README.md`. |
| C5 | Done: `public/robots.txt` and `X-Robots-Tag: noindex` for `/chat`, `/dashboard` and `/admin`. The local Hosting emulator doesn't apply headers, so check with `curl -I` after deploy. |
| D1 | Done: `firebase-admin` 14. Its namespaced API is gone, so scripts use `scripts/_firebaseAdmin.js`; all pass `node --check`, and the usage and credential errors still work. `npm audit fix` applied. Remaining: 5 moderate in the `firebase-tools` CLI (dev only; the only fix is a downgrade) and 2 in `react-router` (needs v7). |
| E1 | Done: `clientErrors` collection, `lib/errorLog.js` (error boundaries + global handlers), **Admin → Errors**. |
| E2 | **Needs you:** the full checklist is in `docs/FIREBASE_SETUP.md` §9 (steps 1–14, including the real NFC device). Report CSP warnings, then the CSP can be enforced. |
| E3 | Done (process): `DEPLOY.md` "Keep an eye on" — weekly usage check (no alerts on Spark). |
| E4 | Done: `OwnerTagIdsProvider` in `DashboardLayout`, one shared `itemOwners` listener; the hook also no longer resubscribes when the user object is refreshed. |

Tests: **100 passing** (11 new) — `npm test`. `npm run build` clean.
