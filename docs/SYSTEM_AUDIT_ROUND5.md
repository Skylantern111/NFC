# TagBack — Full System Audit (Round 5)

Date: 2026-09-30. Branch `tag-content-security-audit` at `c975ad6` (the
version deployed to production today).

This is an audit only. No application code, rules or config were changed.
The code and its behaviour are the source of truth; documents were checked
against them, not the other way round.

**Update (same day, fix planning):** every finding below was re-checked
against the code while planning the fixes; all still match. That pass found
three more issues (NEW-1 to NEW-3) and showed that the originally
recommended fix for SEC-1 (store a hash of the finder token) is not enough
on its own. SEC-1/SEC-2 now describe the corrected fix, which was tested in
the emulator. Fix options and open decisions are in the appendix
("Fix planning").

## How this audit was done

- Read `firestore.rules` in full, plus the auth context, route guards,
  admin check, owner data hooks, Lost Mode, recovery, release, account
  deletion, the finder page, the chat page, the NFC claim/register code and
  the admin pages.
- **Rules probes:** a throwaway test (deleted afterwards) ran nine attacks
  against the Firestore emulator with the real `firestore.rules`. Results
  are quoted as "probe" below.
- **Existing tests:** `npm test` passes 123 tests. They replay the app's real
  Firestore calls against the emulator (sign-up → register → claim → report
  → chat → moderation → recovery → release → blacklist → error log →
  account deletion).
- **Runtime checks done earlier today** (same code): all 23 routes opened in
  headless Chrome with no console errors; the finder ↔ owner chat run end
  to end against the emulator; the guided tour at 320 px, 375 px and
  desktop.
- `npm audit --omit=dev` and a static scan for unused code.
- **Design probe (fix planning):** a scratch script outside the repository
  ran the proposed finder-proof rules against the emulator (see SEC-1).

Labels: **CONFIRMED** = reproduced (probe, test or runtime).
**POTENTIAL** = follows from the code, not reproduced. **NEEDS MANUAL
VERIFICATION** = needs a real device, account or decision.

---

## Executive summary

The core product works: an owner can sign up, verify, claim a tag, turn on
Lost Mode; a finder can tap, report, and chat both ways; the owner can mark
it recovered and release the tag; the admin console registers, writes,
blacklists and moderates. Owner/admin separation is enforced by the
Firestore rules, not only by hidden buttons. Identity separation between
owner and finder holds at the database level.

The weak spots are in the **anonymous finder model** and the **chat
rules**. Anyone who has a chat's link can post as the finder and can flag
the chat. The owner can delete or un-flag a chat the finder reported. Anyone
can send fake "someone found your item" alerts to any tag. None of these
leak identity (email, name, phone), but they allow impersonation, spam and
hiding abuse from moderators.

One real workflow bug: **"I have it back" on My Items turns Lost Mode off
but leaves the finder's report open**, so the item keeps showing as found
and the finder's location is kept.

The fix-planning pass added three findings: the raw finder token is also
saved on every finder message and on reports (NEW-2); a tag's next owner
passes the rules for the previous owner's archived reported chats (NEW-1);
and the finder's report is four separate writes that can half-fail (NEW-3).

The mistaken browser-driver system is already gone (commit `8ff303d`);
nothing of it remains. The in-app guided tour already exists (commit
`3c452b4`) and is working.

---

## Critical issues

None found. No finding exposes an owner's or finder's email, name, phone or
password, or lets a normal user gain admin rights.

## High-priority issues

### SEC-1 — Anyone with a chat link can post as the finder
- **Severity:** HIGH · **Status:** CONFIRMED (probe `strangerPostsAsFinder`: ALLOWED)
- **Area:** Firestore rules, finder identity
- **Files:** `firestore.rules` (`chats` `allow get: if true`; `messages` create finder branch), `src/lib/finderSession.js`
- **Problem:** A chat document is public by ID and contains
  `finderSessionToken`. The rule for a finder's message only checks that the
  message carries the same token as the chat document. So anyone who has
  the chat ID can read the token and send messages as the finder.
- **Current behaviour:** A leaked chat link (shared, screenshotted, left in
  a shared device's history, forwarded from an in-app browser) lets a
  stranger talk to the owner as the finder — for example to ask for the
  reward.
- **Expected:** Only the browser that filed the report can write as the
  finder.
- **Root cause:** The token is used as a secret but stored in a
  publicly readable document. The privacy page says a link lets anyone
  *read* the chat; it does not say they can *write*.
- **Recommended fix (corrected during fix planning):** Storing only a hash
  of the token is not enough. Any raw token the finder sends in a write is
  saved in that document, and messages are public, so the token would leak
  again with the first message (see NEW-2). The fix that works:
  - `chats` and `reports` store `finderKeyHash` (hex SHA-256 of the token);
    no raw token on any public or owner-readable document.
  - Every finder write is a batch that also writes a one-time proof,
    `chats/{chatId}/finderProof/current = { token, at: serverTimestamp() }`.
    Nobody may read `finderProof`.
  - Finder rules check `getAfter(proof).at == request.time` (written in
    this same request, so a stored proof can't be replayed) and
    `hashing.sha256(proof.token).toHexString().lower() == chat.finderKeyHash`.
  - This protects **writes**. Reads stay "anyone with the chat link", as the
    privacy page says; rules can't check a secret on a plain read without
    Firebase Auth.
  - Emulator probe of this design: real finder allowed (twice); stranger
    with a wrong token, with no proof (replaying the stored one), or with
    the public hash as the token: all denied; reading the proof: denied.
  - Needs a migration of existing chats, reports, messages and bans
    (appendix, "Finder token migration"). An alternative is Firebase
    Anonymous Auth for finders (read and write protection), listed as a
    future option.
- **Risk of fixing:** Medium. It changes every finder write path (report,
  chat, message, read marker, finder report), the rules for all of them,
  and Moderation's bans. Needs new rules tests and a production migration.

### SEC-2 — The chat "is a party" check is always true
- **Severity:** HIGH · **Status:** CONFIRMED (probes `strangerUpdatesUnreadFor`, `strangerReportsChatAsFinder`: ALLOWED, unauthenticated, no token)
- **Area:** Firestore rules
- **Files:** `firestore.rules` → `chats` → `isChatParty()`
- **Problem:** `isChatParty()` compares
  `resource.data.finderSessionToken == request.resource.data.finderSessionToken`.
  On an update, `request.resource.data` is the document *after* the
  update, which keeps the stored token unless the caller changes it. The
  comparison is therefore always true.
- **Current behaviour:** Anyone with the chat ID can rewrite `unreadFor`
  (fake unread badges) and file a "finder report" that flags the chat as
  blocked for the moderation queue.
- **Expected:** Only the owner or the real finder can change the chat.
- **Root cause:** The check never looks at a value the caller must prove
  they know.
- **Recommended fix:** Fixed by the SEC-1 design: the finder branches of
  the chat update rule (`unreadFor`, `lastMessageAt`, finder report)
  require the same one-time proof. `isChatParty()` is removed. A proof
  field saved on the chat itself would not work, because the chat is
  public.
- **Risk of fixing:** Medium — same area as SEC-1; the finder's
  `touchChatActivity`, `markChatRead` and report calls must send the proof.

### NEW-2 — The raw finder token is also saved on messages and reports
- **Severity:** HIGH (part of SEC-1) · **Status:** CONFIRMED (code)
- **Files:** `src/lib/ownerItems.js` → `sendChatMessage`, `src/pages/public/NfcLanding.jsx` (report, first message)
- **Problem:** Every finder message carries `finderSessionToken`, and
  messages are public by chat ID. Reports carry it too (owner-readable).
- **Impact:** Removing the token from the chat document alone would not
  close SEC-1. Bans (`blockedTokens/{rawToken}`) also use the raw token.
- **Recommended fix:** Part of the SEC-1 fix; the migration strips the
  token from existing chats, reports and messages and re-keys bans by hash.

### FLOW-1 — "I have it back" leaves the finder's report open
- **Severity:** HIGH · **Status:** CONFIRMED (code trace)
- **Area:** Lost Mode, recovery, data consistency, privacy
- **Files:** `src/pages/dashboard/Items.jsx` (`confirmDisarm`), `src/lib/ownerItems.js` (`toggleLostMode`, `markRecovered`), `src/components/StatusBadge.jsx` (`itemStatus`)
- **Problem:** On My Items, a lost item shows **I have it back**. It only
  calls `toggleLostMode(false)`. It does not close the open report, mark the
  chat recovered, or remove the finder's location. Only **Mark as
  recovered** inside the chat does that.
- **Current behaviour:** After "I have it back", the item's badge still
  says **Found** (an open report outranks Lost Mode in `itemStatus`), Home
  still shows "Action needed", and the finder's shared location stays on
  the report.
- **Expected:** "I have it back" ends the incident the same way as "Mark as
  recovered", or its label says it only turns off Lost Mode.
- **Root cause:** Two separate recovery paths with different effects.
- **Recommended fix:** When the item has an open report, make "I have it
  back" call `markRecovered` for that report and its chat (or show the same
  confirmation as the chat). Otherwise keep the current behaviour.
- **Risk of fixing:** Low — reuses existing, tested code.

## Medium issues

### SEC-3 — The owner can hide a reported chat from moderators
- **Severity:** MEDIUM · **Status:** CONFIRMED (probes `ownerDeletesReportedChat`, `ownerClearsReportedFlag`, `ownerDeletesOpenReport`: ALLOWED)
- **Files:** `firestore.rules` → `chats` (`allow update: if ownsTag(...)`, `allow delete: if ownsTag(...)`), `reports` (`allow ... delete: if ownsTag(...)`)
- **Problem:** The owner may update any field of their chat and delete it,
  even after the finder reported it. They can set `blocked: false` or delete
  the chat, and it disappears from the moderation queue. They can also
  delete the finder's report at any time.
- **Expected:** Once a chat is reported, only an admin can clear or delete
  it (the messages rule already protects reported messages).
- **Recommended fix:** In `chats` update/delete, refuse changes to
  `blocked`/`reportedByFinder`/`reportedByOwner` by the owner once set, and
  refuse delete when `blocked == true`. Keep report delete only for the
  release/account-deletion path (for example, only when the tag is being
  released in the same batch, or accept it as a known limit).
- **Risk of fixing:** Low–medium — `clearTagHistory` already skips reported
  chats, so the app does not rely on these writes.

### SEC-4 — Fake alerts and reports can be sent to any tag
- **Severity:** MEDIUM · **Status:** CONFIRMED (probes `strangerCreatesNotification`, `strangerCreatesReportWithoutTag`: ALLOWED)
- **Files:** `firestore.rules` → `notifications` create, `reports` create, `chats` create
- **Problem:** Anyone, without an account, can create notifications for
  any item that exists, and reports and chats on any tag ID (even one that
  does not exist). There is no rate limit.
- **Current behaviour:** A tag ID is printed on the sticker and in its URL,
  so anyone who has seen a sticker can flood that owner with "Someone found
  your item" alerts and fake incidents.
- **Expected:** Alerts only come from a real report or message; volume is
  limited.
- **Root cause:** Finders have no account, and the project has no server
  code (Spark plan) to validate or rate-limit.
- **Recommended fix:** In the rules, require the notification's `chatId`
  (or `reportId`) to exist and belong to the same tag; require reports to
  target an existing, claimed tag. For volume, Firebase App Check is the
  realistic option without Cloud Functions. Admin token bans already exist.
- **Risk of fixing:** Low for the rule checks; App Check needs setup and
  testing on real devices.

### FLOW-2 — "Mark as recovered" is three separate writes
- **Severity:** MEDIUM · **Status:** POTENTIAL (code trace)
- **Files:** `src/lib/ownerItems.js` → `markRecovered`
- **Problem:** Item, chat and report are updated one after another. If the
  second or third write fails (offline, tab closed), the item is no longer
  lost but the report stays open and the location is kept.
- **Recommended fix:** One `writeBatch` for the three updates.
- **Risk of fixing:** Low.

### QUAL-1 — `npm run lint` does not work
- **Severity:** MEDIUM · **Status:** CONFIRMED (runs and fails)
- **Files:** `package.json`, repository root
- **Problem:** There is no ESLint config file and ESLint is not in
  `devDependencies`. Several files have `eslint-disable` comments for the
  `react-hooks` plugin, which is not installed. CI does not lint.
- **Recommended fix:** Add a flat config with `eslint-plugin-react-hooks`,
  or remove the `lint` script and the disable comments.
- **Risk of fixing:** Low (tooling only). Turning on
  `react-hooks/exhaustive-deps` will report existing warnings.

### NEW-1 — A tag's next owner passes the rules for archived reported chats
- **Severity:** MEDIUM · **Status:** POTENTIAL (rules reading)
- **Files:** `firestore.rules` → `chats` (`list`, `update`, `delete` use `ownsTag(resource.data.tagId)`), `src/lib/ownerItems.js` → `clearTagHistory`
- **Problem:** On release, reported chats are kept for moderation with
  `archivedAt` but keep their `tagId`. If someone else claims the tag
  later, `ownsTag` is true for them on those chats. The app hides them
  (`useOwnerChats` filters `archivedAt`), but the rules let the new owner
  list them, change them and (until SEC-3 is fixed) delete them.
- **Recommended fix:** On archive, move `tagId` to `archivedTagId`; the
  owner rules then no longer match, and Moderation reads either field.
  Needs a small migration for chats archived already. Rules can't exclude
  archived chats from an owner's query by checking a missing field.

## Low-priority issues

### NEW-3 — The finder's report is four separate writes
- **Severity:** LOW · **Status:** CONFIRMED (code)
- **Files:** `src/pages/public/NfcLanding.jsx` → `submitReport`
- **Problem:** Report, chat, first message and notification are written one
  after another. A failure partway leaves a report without a chat, or a chat
  without its first message (that failure is only logged).
- **Recommended fix:** One batch, which the SEC-1 fix needs anyway for the
  proof.

### SEC-5 — The admin sign-up passcode can be guessed without limit
- **Severity:** LOW · **Status:** NEEDS MANUAL VERIFICATION
- **Files:** `firestore.rules` → `validAdminPasscode()`, `users` create
- **Problem:** Each guess is a `users/{uid}` create. A wrong guess is
  rejected, but nothing limits the number of guesses. The rule only requires
  8+ characters. Passcode admins also need a verified email, so a guesser
  needs a real inbox.
- **Recommended fix:** Use a long random passcode (20+ characters) and clear
  it (`meta/adminSignup`) when no admin sign-up is expected.
- **Risk of fixing:** None (operational).

### FLOW-3 — Tap history stays with the tag after release
- **Severity:** LOW · **Status:** POTENTIAL (code trace)
- **Files:** `src/lib/ownerItems.js` → `releaseTag`/`clearTagHistory`
- **Problem:** `tags/{id}/scans` is not cleared on release. The next owner
  sees the previous owner's tap count (time and page shown; no identity).
  The rules make scans immutable, so the owner cannot delete them.
- **Recommended fix:** Accept and document it, or have the scan counter
  count only taps after the current claim date.
- **Risk of fixing:** Low.

### FLOW-4 — A failed account deletion leaves profile repair paused
- **Severity:** LOW · **Status:** POTENTIAL
- **Files:** `src/lib/account.js` → `deleteMyAccount`
- **Problem:** `profileRepairPaused.current = true` is never reset if a
  step fails. For the rest of that session a missing profile is not
  re-created.
- **Recommended fix:** Reset it in a `finally` (except after success).
- **Risk of fixing:** Very low.

### QUAL-2 — Tag status listeners have no error handler
- **Severity:** LOW · **Files:** `src/lib/ownerItems.js` → `useOwnerItems`
- **Problem:** The per-tag `tags/{id}` listener has no error callback, and
  each owned tag opens two listeners. A fleet owner with hundreds of tags
  opens hundreds of listeners.
- **Recommended fix:** Add an error callback; for large owners, read tag
  status in `in` chunks like reports.

### QUAL-3 — Large main bundle
- **Severity:** LOW · **Status:** CONFIRMED (build warning)
- **Problem:** The main chunk is about 937 kB (253 kB gzipped), mostly the
  Firebase SDK, loaded by every page including the finder's tap page.
- **Recommended fix:** Measure the tap page on a mid-range phone first; if
  slow, split Auth out of the finder path.

### QUAL-4 — `react-router` advisories
- **Severity:** LOW · **Status:** CONFIRMED (`npm audit`: 2 moderate)
- **Problem:** Open-redirect via backslash in `<Link>`/`useNavigate`, and an
  SSR-only issue. The app does not navigate to URL-controlled paths (the
  login redirect comes from router state, not the query string), so no
  exploitable path was found.
- **Recommended fix:** Plan the move to React Router 7.

### QUAL-5 — Stale profile field
- **Severity:** LOW · **Files:** `src/context/AuthContext.jsx`, `src/components/SignupForm.jsx`
- **Problem:** New profiles get `notificationPrefs: { email: true }`, but
  email alerts do not exist.
- **Recommended fix:** Drop the field or set it to false.

### UX-1 — One browser can only be one side of a chat at a time
- **Severity:** LOW · **Status:** CONFIRMED, partly fixed in `c975ad6`
- **Problem:** Firebase sign-in is shared by every tab. Since `c975ad6` the
  finder's open tab stays on the finder side when the owner signs in, but a
  new tab with both identities opens as the owner. Testers using one browser
  for both roles can still be confused.
- **Recommended fix:** Document: test finder and owner in different
  browsers or a private window.

---

## Security findings (summary)

| ID | Finding | Status | Severity |
|---|---|---|---|
| SEC-1 | Anyone with a chat link can post as the finder | CONFIRMED | HIGH |
| SEC-2 | Chat "party" check always true: strangers can flag chats and change unread state | CONFIRMED | HIGH |
| NEW-2 | Raw finder token also on messages and reports | CONFIRMED | HIGH (part of SEC-1) |
| SEC-3 | Owner can delete/un-flag a reported chat and delete the finder's report | CONFIRMED | MEDIUM |
| NEW-1 | Next owner of a tag passes the rules for archived reported chats | POTENTIAL | MEDIUM |
| SEC-4 | Unauthenticated fake alerts/reports/chats, no rate limit | CONFIRMED | MEDIUM |
| SEC-5 | Admin passcode guessable without limit | NEEDS MANUAL VERIFICATION | LOW |
| SEC-6 | Finder bans are per browser (clearing storage gives a new token) | CONFIRMED (by design) | INFO |
| SEC-7 | `tags/{id}` is public and includes `physicalUid` (hardware ID, no PII) | CONFIRMED | INFO |
| SEC-8 | Unclaimed tags can be claimed by anyone who sees the printed ID (verified email required) | By design | INFO |

**Verified as correctly enforced:**
- Admin data (`tags` list/write, `tagAdmin`, `blockedTokens`, `meta`, all
  `users`, `clientErrors`) is admin-only in the rules. A normal user who
  opens `/admin/*` is sent to `/admin/login` by `AdminGate`, and even
  without the page guard the rules refuse every admin read/write. Hiding
  buttons is not the security mechanism.
- A passcode admin only counts once their email is verified; a disabled
  account is never admin and is signed out by the profile listener.
- Owners can only write their own tags (`ownsTag`), and claiming needs a
  verified email.

## Privacy findings

- **Holds:** `items`, `tagProfiles` and `tags` contain no owner identity.
  `itemOwners` (tag → owner) and `users` (email, name) are private. A finder
  cannot learn the owner's email, name or phone from the database. The
  owner never sees a finder's identity: the finder has no account, only a
  random token. Location is rounded to about 11 m (4 decimals) in
  `lib/geolocation.js` and removed when the owner marks the item recovered.
- **Gap (FLOW-1):** "I have it back" keeps the finder's location on the
  report.
- **Gap (SEC-1):** the privacy page says anyone with a chat link can read
  it, but not that they can also write as the finder.
- **Gap (FLOW-3):** tap history stays with the tag after release (no
  identity, only times and page shown).
- **Finder token:** it is the same token for all of a finder's chats, is
  readable by the owners of those tags, is saved on every finder message
  (NEW-2), and is stored in `localStorage` (`reclaim_finder_token`). Not
  personal data, but it is the finder's only credential (see SEC-1).
- **Archived chats (NEW-1):** a tag's next owner could read the previous
  owner's reported chats through the rules, though the app doesn't show
  them.
- **Error reports:** `clientErrors.url` stores the full page address,
  including a chat ID; only admins can read it, and admins can already read
  reported chats.

## UX findings

The UI/UX rounds already fixed loading, empty and error states (a failed
load shows an error with Retry, not "No items yet" — checked in `useOwnerItems`,
`useOwnerOpenReports`, `useOwnerChats`, Dashboard, Items and Messages).
Remaining:

- **FLOW-1** (above) is also a UX problem: the button says "I have it back"
  but the item keeps saying "Found".
- **UX-1** (above): same-browser testing.
- **UX-2 (LOW):** the admin "Test tag without NFC hardware" card is in
  production Settings. Test tags look like real stock in Inventory except
  for `nfcCapabilityAtRegistration: 'dev-fallback'`. Consider a visible
  "Test" badge or hiding it outside development.
- 320 px, 375 px and desktop layouts, the guided tour, keyboard focus in the
  tour and chat, and reduced motion were checked earlier today; no new
  problems found. Screen-reader use on a real phone (TalkBack/VoiceOver) has
  not been tested.

## Code quality findings

- QUAL-1 lint broken, QUAL-2 listeners, QUAL-3 bundle size, QUAL-4 router
  advisories, QUAL-5 stale field (all above).
- No unused files. A static scan (every file imported, every export used)
  found no dead application code after the cleanup in `8ff303d`.
- `console.warn` is used for listener failures on purpose (not debug
  leftovers). No `TODO`/`FIXME` markers found in `src/`.

## Dead / unused code

- **Removed already (`8ff303d`):** `findChatIdForReport`, unused React
  imports, unused Tailwind animations, unused imports in Inventory and
  Settings.
- **Unused but intentionally kept:** unused sub-exports of the shadcn
  `ui/` components (e.g. `DialogTrigger`, `SheetFooter`,
  `DropdownMenuSub*`, `TableCaption`) — standard component API; preview
  mock-data exports in `ownerItems.js`/`moderation.js` (used in placeholder
  mode); `public/robots.txt` (read by crawlers, not by code).
- **Nothing else to remove was found.**

## Mistaken driver system

Already removed in commit `8ff303d` ("Remove the browser-automation drivers
and dead code"): the `drivers/` folder (four scripts, README, env example,
local `.env.drivers`, screenshots), the `drivers:user`/`drivers:admin` npm
scripts, the README section and the `.gitignore` entry. The drivers added
no dependencies.

This audit searched again for `drivers/`, `user-driver`, `admin-driver`,
`driver-config`, `DRIVER_*`, `TEST_USER_*`, `TEST_ADMIN_*`, `TEST_TAG_ID`,
`CHROME_PATH` and `BASE_URL`: **no references remain**. (`VITE_PUBLIC_BASE_URL`
is a real app setting used by `lib/tags.js#tagUrl` and must stay.)

**Guided tour:** the in-app tutorial already exists (commit `3c452b4`,
`src/components/tutorial/`, separate owner and admin tours, restart from
Settings › Help). It was not changed in this audit.

## Documentation mismatches

| Document | Says | Code does | Fix |
|---|---|---|---|
| README "Admin" | Owners page sets the admin passcode | Passcode is in Admin Settings | Update |
| README "Admin" | Errors listed as its own section | Error log is under Settings › Maintenance | Update |
| README "Owner" | "My NFC Profile" | Page is called "Tap page" | Update |
| README "Tests" | Two test files | Three (`tests/tutorial.test.js`) | Add |
| README, ARCHITECTURE, SYSTEM_DOCUMENTATION | — | Guided tour exists, not mentioned | Add a section |
| ARCHITECTURE §3 route table | Admin routes without `settings` | `/admin/settings` exists | Add |
| Privacy page | A chat link lets anyone read the chat | Also lets them write as the finder (SEC-1) | Fix SEC-1 or reword |

## Feature status

| Feature | Status | Evidence |
|---|---|---|
| Owner sign-up, email verification, login/logout | IMPLEMENTED | code, flows test |
| Claim tag by typed TagBack ID | IMPLEMENTED | code, flows test |
| Claim tag by Web NFC scan | IMPLEMENTED (Android Chrome only) | code (`'NDEFReader' in window`); needs a device |
| Finder opens tag by tapping (URL on sticker) | IMPLEMENTED (any NFC phone, incl. iPhone) | `/nfc/:tagId` route; needs a device |
| Item details, edit item | IMPLEMENTED | code, runtime |
| Lost Mode on/off, message, reward | IMPLEMENTED | code, flows test |
| Finder report with optional location | IMPLEMENTED | code, flows test, runtime |
| Two-way anonymous chat, alignment | IMPLEMENTED | emulator + browser run today |
| Owner alerts (in-app, badge, tab title) | IMPLEMENTED | code |
| Email alerts | NOT IMPLEMENTED (stated in Settings) | — |
| Mark recovered (from chat) | IMPLEMENTED | code, flows test |
| "I have it back" (from My Items) | PARTIAL / BROKEN (FLOW-1) | code trace |
| Release tag | IMPLEMENTED | code, flows test |
| Delete account | IMPLEMENTED | code, flows test |
| Tap page content (profile/redirect) | IMPLEMENTED | code, rules tests |
| Admin: register tag, write NFC | IMPLEMENTED (writing needs Android Chrome) | code; needs a device |
| Admin: inventory, search, CSV, blacklist/unblacklist | IMPLEMENTED | code, flows test |
| Admin: moderation, finder bans | IMPLEMENTED (bans are per browser) | code, flows test |
| Admin: owners lookup/disable | IMPLEMENTED | code, flows test |
| Admin: error log, settings, passcode | IMPLEMENTED | code, flows test |
| In-app guided tour (owner, admin) | IMPLEMENTED | runtime today |
| Analytics page | NOT IMPLEMENTED (left out of the admin menu on purpose) | `AdminSidebar.jsx` comment |
| Staging environment | PLANNED (postponed) | `DEPLOY.md` |
| Rate limiting / App Check | NOT IMPLEMENTED | SEC-4 |

## Working features (verified)

- ✓ Firestore rules for claim, release, registration, field limits, tag
  content, chat reports, admin sign-up (123 emulator tests pass).
- ✓ Full owner → finder → admin data flow as replayed by `tests/flows.test.js`.
- ✓ Admin route and data protection (AdminGate + rules; code trace and tests).
- ✓ Owner route protection (`ProtectedRoute`; code trace).
- ✓ Finder ↔ owner chat, continuous replies, "mine on the right" in both
  views, survives reload (emulator + browser, today).
- ✓ Load errors shown as errors, not as empty lists (code trace).
- ✓ All 23 routes render without console errors (preview mode, today).
- ✓ Guided tour at 320 px, 375 px and desktop (today).
- ✓ Production build succeeds.

## Needs manual testing

- Web NFC scan to claim, and admin register + write, on an Android phone in
  Chrome over HTTPS.
- Tapping a written sticker on an iPhone and on Android (opens `/nfc/:tagId`).
- Verification and password-reset emails arrive (spam folder too).
- A finder and an owner on two phones, full chat and "Mark as recovered".
- A finder who opens the chat link in Messenger's in-app browser (expected:
  read-only, with an "open in browser" hint).
- Offline and poor-connection behaviour on a phone.
- The strength of the current admin sign-up passcode (SEC-5).
- TalkBack / VoiceOver on the finder page and chat.
- GitHub Actions CI result for the latest commits (not visible from here).

## Recommended fix order

This order follows technical dependencies (details in the appendix):

1. **Rules design spike:** the SEC-1 proof rules against the full ruleset,
   checking the per-request document-read limit. Everything after rewrites
   the same rules.
2. **SEC-1 + SEC-2 + NEW-2 + NEW-3:** finder proof, single-batch finder
   report, hash backfill of existing data. Raw tokens are stripped later
   (step 7), because that ends the rollback window.
3. **FLOW-1 + FLOW-2:** one shared, batched recovery used by both "I have
   it back" and "Mark as recovered".
4. **SEC-3 + NEW-1:** lock reported chats. Its owner field list must
   include every owner write from steps 2–3.
5. **SEC-4:** relationship rules on the new batch shape; decide on a
   per-tag throttle and App Check.
6. **QUAL-1** first, then the other small follow-ups (QUAL-2, FLOW-4,
   QUAL-5, UX-2, SEC-5 operational steps).
7. **Strip raw tokens** from production data (take an export first).
8. **Documentation.**

---

## Appendix — Fix planning (same day)

### Finder authorization options (SEC-1, SEC-2, NEW-2)

| | A: store hash only | B: hash + one-time write-only proof | C: Anonymous Auth |
|---|---|---|---|
| Stops write impersonation | No (raw token re-leaks via messages) | Yes (emulator-tested) | Yes |
| Protects reads | No | No (link = read access) | Yes |
| Finder needs an account | No | No | Anonymous account |
| Spark plan | Yes | Yes | Yes (cleanup of anonymous users is limited) |
| Offline | Yes | Yes (batches queue) | Needs network to sign in first |
| Migration | Backfill + strip | Backfill + strip + re-key bans | B's migration plus a bind step per chat |
| Same browser as owner | No change | No change | Owner sign-in replaces the finder session |

### Finder token migration (Option B)

1. **Backfill** (additive, safe under current rules): add `finderKeyHash`
   to chats and reports, and hash-keyed `blockedTokens` docs. Keep the raw
   fields. Admin SDK script using `scripts/_firebaseAdmin.js`.
2. **Deploy** new rules and new client together (proof only; no legacy
   path, which would keep the hole open).
3. **Verify** in production: a real finder can send, a stranger can't.
4. **Strip** raw tokens from chats, reports and messages; delete raw-keyed
   bans. Export Firestore first (`scripts/exportFirestore.js`). Rolling back
   to the old rules is only possible before this step.

No downtime and nothing for users to do: finders keep their `localStorage`
token and the new client hashes it with Web Crypto. A finder with an old
page open gets "Not sent — Retry" until they reload.

### Recovery options (FLOW-1, FLOW-2)

| Option | Effect |
|---|---|
| A: "I have it back" calls `markRecovered` | Fixes the single-finder case; other finders' open reports stay open |
| B: shared `recoverItem(tagId)` used by both buttons | Closes every open report on the tag, removes each location, marks each chat recovered, in one batch |
| C: separate actions, clearer wording | Smallest change; the owner still has to pick the right one |

Use a `writeBatch`, not a transaction: nothing is read before writing, and
transactions fail offline. Only include reports the client knows exist; an
update to a missing document fails the whole batch.

### Moderation integrity options (SEC-3, NEW-1)

- **A:** owner updates limited to `lastMessageAt`, `lastMessageText`,
  `unreadFor`, `resolved`, `archivedAt`, `blocked` (only to true) and
  `reportedByOwner` (only if not set); no delete when `blocked == true`.
  Release and account deletion keep working (`clearTagHistory` already
  skips reported chats).
- **B:** A, plus `archivedTagId` for archived chats (NEW-1).
- **Open question:** limit report deletion to the release path, or accept
  it as a known limit.

### Anti-spam options (SEC-4)

| Option | Plan | Effect |
|---|---|---|
| A: relationship rules (report needs a claimed tag; chat needs its report; notification needs its chat) | Spark | Blocks free-floating fakes, not a repeated real flow |
| A2: per-tag throttle doc (one report per tag per 2 minutes) | Spark | Limits volume per tag |
| B: App Check (reCAPTCHA) | Spark | Blocks scripts; roll out in metrics mode first |
| D: Cloud Functions (server intake, rate limits, notification fan-out) | Blaze | Strongest; needs a plan change |

### Other follow-ups

| ID | Kind | Options |
|---|---|---|
| QUAL-1 | Maintainability | Add ESLint + react-hooks config and a CI step (warnings first), or remove the script |
| QUAL-2 | Reliability | Add error callbacks (a batched `in` query on `tags` isn't allowed: listing tags is admin-only) |
| QUAL-3 | Performance | Measure the tap page first; then consider keeping Auth out of public pages |
| QUAL-4 | Security (low) | Turn on v7 future flags, then upgrade; or accept |
| QUAL-5 | Maintainability | Write `email: false` or drop the field |
| FLOW-3 | Privacy (minor), possibly intentional | Document, or count only taps since the claim (rules change) |
| FLOW-4 | Reliability | Reset the flag when deletion fails |
| SEC-5 | Security (operational) | Long random passcode and clear it when unused, or turn off self-serve admin sign-up |
| UX-1 | UX / docs | Document; optional in-chat hint |
| UX-2 | UX | Hide outside development, or add a "Test" badge in Inventory |

### Decisions needed before implementation

1. Finder authorization: Option B, or Anonymous Auth (C)?
2. Running the migration script against production (who runs it; export
   before the strip step).
3. Accept "Not sent — Retry" for finders with an old page open during the
   rollout.
4. Recovery: option A, B or C; should one recovery close all open reports
   on the item?
5. Moderation: SEC-3 option A or B; keep owner report deletion outside
   release?
6. Anti-spam: which rules, the throttle, App Check now or later, Cloud
   Functions at all?
7. Admin passcode: rotate, or turn off self-serve admin sign-up.
8. Test-tag card in production: hide, badge, or keep.
9. Tap history after release: document or change.
10. Lint: add ESLint or remove the script.
11. React Router 7: now or later.
12. Documentation updates as part of the work.
13. Scope: minimal (SEC-1/2, FLOW-1/2, SEC-3 option A) or the fuller set.
14. Merge to `main` before rules changes, as `DEPLOY.md` requires.
