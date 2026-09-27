# System Audit — Round 2

Status: **implemented** (2026-09-27) — see "Implementation status" at the end,
including **A0**, a critical bug found while testing the fixes. Date: 2026-09-27.
Code audited: branch `tag-content-security-audit` at `0cd5053`, the version
deployed to https://nfc-lost-and-found.web.app. Round 1
(`SYSTEM_AUDIT_PLAN.md`) is fixed and deployed; this round looks for what
is still wrong, including in the code added since.

Every finding points to a file and a concrete failure. Findings marked
**(verified)** were confirmed by running a test against the Firestore
emulator, not only by reading the code.

Severity key:
- **High:** security or privacy hole, or a broken main flow.
- **Medium:** wrong behavior in a real but less common case.
- **Low:** cosmetic, dead code, or hygiene.

---

## A. Security and privacy (`firestore.rules`)

### A1 [High] Anyone can list every tag, item and tag profile (verified)
`tags`, `items` and `tagProfiles` use `allow read: if true`. In Firestore,
`read` covers both **get** (one doc by ID) **and list** (queries). So an
anonymous visitor can run:

- `query(collection(db, 'tags'), where('status', '==', 'registered'))`
  This returns **every unclaimed TagBack ID**. The claim model assumes that
  knowing an ID means holding the sticker. With this list, a script can
  claim every unclaimed sticker remotely before the real buyers do.
- `getDocs(collection(db, 'items'))`: every item name and lost message.
  Owners type personal details into lost messages ("call me at…").
- `getDocs(collection(db, 'tagProfiles'))`: every display name, bio and
  contact link.

The emulator test ran all three as an unauthenticated user, and all three
succeeded.

**Fix:** split `read` into `get` and `list`:
- `get: if true` for all three (the public page reads by ID only).
- `list`:
  - `tags`: admin only.
  - `items`: `isAdmin() || ownsTag(resource.data.tagId)` (Moderation's
    `where('tagId', 'in', …)` query is admin).
  - `tagProfiles`: admin only (Inventory and Tag Content use
    `documentId() in` as admin).

Owner pages read items and tag profiles by document ID, so they keep
working.

### A2 [Medium] A disabled admin keeps full admin access
`isAdmin()` checks the custom claim or `users/{uid}.isAdmin`, but never
`disabled`. Disabling an admin account on the Owners page signs it out
(`AuthContext`). But the account can sign back in, and every admin rule
still passes.
**Fix:** `isAdmin()` also requires `!isDisabledOwner(request.auth.uid)`.
To remove a claim-based admin, also run `setCustomUserClaims(uid, { admin: false })`.

### A3 [Medium] The admin signup passcode can be guessed without limit
`validAdminPasscode()` only requires 6+ characters. A signed-in attacker
can retry `setDoc(users/{uid}, { isAdmin: true, adminPasscode: guess })` as
often as Firestore quotas allow. A failed create leaves nothing behind, so
there is no lockout.
**Fix (no backend):**
- Require a long passcode (e.g. 16+ random characters), and make
  `AdminSignupPasscodeCard` generate one.
- Suggest turning signup off (delete `meta/adminSignup`) whenever no admin
  is being onboarded.

### A4 [Medium] Chat messages accept any extra fields and any timestamp
`chats/{chatId}/messages` create checks `sender`, `text` length and the
token, but:
- does not use `hasOnly`, so a message can carry arbitrary extra fields,
  up to Firestore's 1 MiB document limit
- does not require `timestamp == request.time`, so a message can be
  back-dated or future-dated, which changes where it appears in the
  thread (`orderBy('timestamp')`), or left without a timestamp, which
  hides it from the thread entirely

**Fix:**
- `hasOnly(['sender', 'text', 'timestamp', 'finderSessionToken'])`
- `timestamp == request.time`

### A5 [Low] Public tag docs still show hardware and write details
`tags` docs are public (by ID, after A1) and still carry `physicalUid`,
`chipType`, `nfcCapabilityAtRegistration`, `writeStatus` and
`lastWriteError`. The public page doesn't need any of them.
**Fix:** move them to `tagAdmin/{tagId}`, like the A7 fields in Round 1,
or accept them as harmless.

### A6 [Low] Anyone can send a notification to any owner
`notifications` create only needs an existing `items/{tagId}`. Any script
can flood an owner's alert feed. This is known (it needs App Check), but it
is now also the path for B5's message alerts.
**Fix:** App Check (no cost, but needs console setup); until then, accept.

---

## B. Workflow bugs

### B1 [Medium] A notification can open the wrong chat
`dashboard/Notifications.jsx:128` links to `chatByTag[n.tagId]`: one chat
per tag, and not the chat the notification is about. `chatByTag` is built
with `Object.fromEntries` over chats sorted newest-first, so it keeps the
**oldest** chat for that tag. Every notification carries `chatId`, but it
isn't used.
**Fix:** link to `/chat/${n.chatId}` when present.

### B2 [Medium] The dashboard can pair a report with the wrong chat
`dashboard/Dashboard.jsx:42/55` has the same `chatByTag[report.tagId]`
pattern. With two open reports on one tag (two finders), both cards show
the oldest chat's text and link.
**Fix:** match `chat.reportId === report.id`.

### B3 [Medium] Newest notifications can be missing
`lib/ownerItems.js#useOwnerNotifications` queries
`where('tagId', 'in', group), limit(200)` with **no `orderBy`**. Firestore
returns the first 200 by document ID, not the newest. Once a tag passes
200 notifications (e.g. spam, or a long-lived tag), new alerts can drop out
of the feed and the unread badge.
**Fix:** `orderBy('createdAt', 'desc')`. This needs a composite index
(`tagId`, `createdAt`) in `firestore.indexes.json`. Alternative: remove the
cap and rely on "Clear read".

### B4 [Medium] Signed-out visitors to `/admin/*` land on the owner login
`App.jsx:91-97` wraps `AdminLayout` in `ProtectedRoute`, which sends
signed-out users to `/login` before `AdminGate` can send them to
`/admin/login`. Admins then sign in on the owner page, and are dropped on
`/admin/...` without the admin check message.
**Fix:** remove `ProtectedRoute` around `AdminLayout`. `AdminGate` already
handles both signed-out users and non-admins.

### B5 [Medium] Release deletes data before the release itself succeeds
`lib/ownerItems.js#releaseTag` deletes reports, notifications and chats in
batches, **then** runs the release transaction. If the transaction fails
(network, disabled account), the owner keeps the tag but has lost its
history. The order is forced by the rules: after release, the owner can
no longer delete.
**Fix:**
- Show a clear confirmation that history will be deleted.
- Retry the transaction on failure.
- Tell the user if it still fails, so they know the history is already
  gone.

### B6 [Low] "In-app alerts" toggle does nothing
`Settings.jsx` saves `notificationPrefs.inApp`, but nothing reads it.
Alerts show either way. This is the same kind of problem as the old
`contactEnabled` switch (R2.1).
**Fix:** remove the switch, or hide the sidebar badge and tab-title count
when it's off.

### B7 [Low] Email verification is never required
New accounts can claim tags, create admin accounts (with the passcode) and
chat without verifying their email. Settings only shows a status line.
**Fix:** require `emailVerified` for admin signup completion (checked in
`AdminGate`), and optionally for claiming.

### B8 [Low] Bulk content page loses its selection on refresh
`/admin/tags/bulk` takes the tag list from router state. After a reload,
the page shows "No unclaimed tags selected".
**Fix:** put the IDs in the URL (fine for ≤ 100), or in sessionStorage.

### B9 [Low] "Lost item" label on items that aren't lost
`Dashboard.jsx:149` always labels an incident "Lost item", even when the
owner never turned Lost Mode on (a finder can report any claimed tag).
**Fix:** use "Your item" unless `item.isLostMode`.

### B10 [Low] Owner redirects auto-continue after 5 seconds
The C1 "You're leaving TagBack" page (`NfcLanding.jsx`) still forwards by
itself. A visitor who doesn't read it is sent on anyway, which weakens the
phishing protection.
**Fix:** require a click for owner-set redirects. Keep auto-continue only
where `editorRole` is `admin` (those are already instant).

---

## C. Code hygiene and build

### C1 [Low] Dead code that calls a third-party map proxy
`src/components/Map.jsx` loads Google Maps through
`https://forge.butterfly-effect.dev` using `VITE_FRONTEND_FORGE_API_KEY`.
`src/components/ManusDialog.jsx` is also leftover template code. Neither
is imported anywhere; the app uses `ReportLocationMap.jsx` (Leaflet +
OpenStreetMap).
**Fix:** delete both files, and `hooks/usePersistFn` if it's then unused.

### C2 [Low] Many unused UI components and packages
`src/components/ui` has 53 components; about 14 are used. The unused ones
are tree-shaken out of the bundle, but their Radix packages remain
dependencies. The entry bundle is still ~975 kB (Round 1 §6.1).
**Fix:**
- Remove unused components and packages.
- Then run a bundle-analyzer pass (`rollup-plugin-visualizer`).

### C3 [Low] `dropdown-menu.jsx` uses Tailwind v4 class syntax
The project is on Tailwind v3.4. Classes like `outline-hidden`,
`max-h-(--radix-…)` and `origin-(--radix-…)` do nothing. Inventory's new
⋯ menu works around the outline. A long menu would not scroll.
**Fix:** convert those classes to v3 equivalents
(`outline-none`, `max-h-[var(--radix-…)]`).

### C4 [Low] npm uses plain HTTP on this machine
`npm config get registry` returns `http://registry.npmjs.org/`. Packages
are downloaded unencrypted, which allows tampering in transit. `npm audit`
fails for the same reason ("426 Upgrade Required"). This is a machine
setting, not a repo file.
**Fix:** `npm config set registry https://registry.npmjs.org/`, then run
`npm audit`.

### C5 [Low] No `.gitignore` rule for service-account keys
Four scripts need `GOOGLE_APPLICATION_CREDENTIALS` (a service-account JSON
key). Nothing in `.gitignore` stops a key saved in the repo folder from
being committed.
**Fix:** add `*service-account*.json` and `*-firebase-adminsdk-*.json`.

### C6 [Low] Untracked plan file
`TAG_CONTENT_BEYOND_STICKERS_PLAN.md` is still untracked (implementation
was cancelled). Commit it as a record, or delete it.

---

## D. Known limitations (unchanged, need App Check or a backend)

- Finder identity is a localStorage token. Bans are easy to bypass, and
  anyone holding a chatId can act as that chat's finder.
- No push or email notifications (Round 2 R2.2 — needs Cloud Functions,
  i.e. the paid plan).
- Link previews are the same for every tag (needs server rendering, i.e.
  the paid plan).

---

## E. Suggested fix order

1. **A1** (public listing): rules only, closes remote claiming of every
   unclaimed sticker. Add emulator tests for get vs list.
2. **A2, A3, A4**: small rules changes, plus a longer passcode.
3. **B1, B2, B3, B4**: owners land on the wrong chat, miss alerts, or
   admins land on the wrong login.
4. **B5, B10**, then the Low items.
5. **C4** (npm HTTPS) before installing any new package.

---

## Implementation status

### A0 [Critical — found during implementation, live until deployed]
**Every real owner was blocked by the rules.** `isDisabledOwner()` read
`users/{uid}.data.disabled`. Reading a field that a document doesn't have
is an *evaluation error* in Firestore rules, and `!isDisabledOwner(...)`
then denies. Profiles never have `disabled` unless an admin set it, so
every user with a profile doc was denied claiming a tag, editing items,
reading their reports, releasing, and so on. The existing tests missed it
because none of their users had a profile doc.

Confirmed by running the **deployed** rules (`0cd5053`) in the emulator:
a normal owner's claim and item edit both failed with "Property disabled
is undefined". It has probably been live since `1c278ce` (2026-09-05).

**Fix:** `.get('disabled', false)`, and the same for other optional reads:
`token.admin`, `token.email_verified`, `users.isAdmin` and
`meta.adminSignup.passcode`. Three new tests use realistic profiles.

### Fixed
| Item | Fix |
|---|---|
| A1 | `tags`, `items`, `tagProfiles`: `get` public, `list` admin-only (`items` also the owner). |
| A2 | `isAdmin()` requires `!isDisabledOwner(...)` — claim and passcode admins alike. |
| A3 | Passcode must be ≥ 8 characters (lowered from 16 at the owner's request; rules, card, script). The Owners card has **Generate** (8 random characters) and **Copy**, and suggests turning signup off when unused. |
| A4 | Messages: `hasOnly(sender, text, timestamp, finderSessionToken)` and `timestamp == request.time`. |
| B1 | Notifications open `n.chatId` (fallback: the newest chat on that tag). |
| B2 | Dashboard pairs each report with `chat.reportId === report.id`. |
| B3 | Notifications query `orderBy('createdAt', 'desc')`, with a new composite index in `firestore.indexes.json` (**deploy indexes**). |
| B4 | `ProtectedRoute` removed around `/admin`; `AdminGate` sends signed-out users to `/admin/login`. |
| B5 | Release dialog says reports/chats/alerts are deleted; the release step retries up to 3 times, and a failure after cleanup shows a specific message. |
| B6 | "In-app alerts" switch replaced by a plain statement. |
| B7 | **Reverted** at the owner's request: the "verify your email" step for passcode admins didn't work for them in practice. Admins are not required to verify their email. |
| B8 | Bulk content selection is kept in `sessionStorage` across reloads. |
| B9 | Dashboard label: "Lost item" only when Lost Mode is on, else "Your item". |
| B10 | Owner redirects need a click ("Continue to <domain>"); no auto-continue. |
| C1 | Deleted `components/Map.jsx` and `components/ManusDialog.jsx` (plus unused `hooks/useMobile.jsx`). `usePersistFn` is kept (used by inputs). |
| C2 | Deleted 37 unused UI components and uninstalled 29 unused packages. Entry bundle **975 kB → 891 kB**. Bundle analysis: what remains is mostly the Firebase SDK (`@firebase/firestore` about 650 kB before minifying, `firebase` 280 kB, `react-dom` 132 kB). That is needed; no further safe cut without restructuring. |
| C3 | Tailwind v4 classes in `ui/*` converted to v3 (`outline-none`, `max-h-[var(…)]`, `origin-[var(…)]`, `shadow-sm`, `rounded-sm`). |
| C4 | npm registry set to `https://registry.npmjs.org/` (machine setting). `npm audit` now works. |
| C5 | `.gitignore` ignores `*service-account*.json` and `*-firebase-adminsdk-*.json`. |
| C6 | `TAG_CONTENT_BEYOND_STICKERS_PLAN.md` kept as a record (not implemented), to be committed with this change. |

### Accepted, not changed
- **A5** (hardware fields on public tag docs): `ClaimTag` reads
  `physicalUid` before claiming, for the swapped-sticker warning, so it has
  to stay readable by ID. Listing is now admin-only (A1), so these fields
  can't be harvested in bulk.
- **A6** (notification spam): needs Firebase App Check (free, but needs
  reCAPTCHA setup in the Firebase console).
- **npm audit:** 2 moderate advisories in `react-router` 6.x (open redirect
  via a backslash in `<Link>`/`navigate`, and an SSR-only issue). The fix is
  the react-router 7 major upgrade. Low impact here: every navigation
  target in the app is an internal path.

Tests: 60 passing (10 new). `npm run build` clean.

**Deploy:** `firebase deploy --only firestore:rules,firestore:indexes,hosting`.
Rules, indexes and hosting must go together. A0 makes the rules deploy
urgent. After deploy:
- Any passcode shorter than 8 characters stops working; set a new one
  with **Generate**.
