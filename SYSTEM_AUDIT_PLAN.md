# System Audit — Bugs Found and Improvement Plan

Status: **implemented** (2026-09-27), except §D items 4–8. See
"Implementation status" at the end. Audit date: 2026-09-27.

Scope: the whole workflow — admin registration and writing, tag content
(new, uncommitted), claim, owner dashboard, finder page, chat, moderation,
and `firestore.rules`. Every finding below comes from reading the code, not
from a guess. Each finding has a location, a failure scenario and a fix.

Severity key:
- **Critical**: a security hole anyone with an account can use today.
- **High**: breaks a main flow, or leaks private data.
- **Medium**: wrong behavior in a less common case, or an abuse path.
- **Low**: cosmetic, or a minor data-quality issue.

"Live" means the bug is in the code deployed on 2026-09-27 (commit
`7f59eb4`). "New" means it's in the uncommitted tag-content work.

---

## A. Security (firestore.rules)

### A1 [Critical, live] Any user can make themselves admin
`firestore.rules` `users/{uid}`: `allow delete` lets a user delete their own
doc, and `allow create` accepts **any fields** for your own uid. So:
1. A normal user deletes `users/{uid}`.
2. They re-create it with `isAdmin: true`.
3. `isAdmin()` now returns true, giving full admin access to rules and the
   admin console.

The rules comment claims "isAdmin can only ever be set at document creation
… this doesn't let an already-signed-up non-admin self-upgrade". That is
wrong, because delete + create is allowed. The signup passcode doesn't
help either: it is only checked in `Register.jsx`, never in rules.

**Fix:**
- On create, allow `isAdmin` only as `false` (or absent), and never allow
  `disabled`.
- Block self-delete of `users/{uid}`, or at least block re-create after
  delete.
- Real admins then come only from `scripts/setAdmin.js`, the custom claim.
- To keep the passcode signup, move it server-side (needs a backend), or
  accept "admins are granted by script only".
- Run `scripts/revokeSelfServeAdmin.js` against any unexpected
  `isAdmin: true` docs.

### A2 [Critical, live] Disabled accounts can re-enable themselves
Same mechanism as A1. A disabled owner deletes their `users/{uid}` doc.
`isDisabledOwner()` then returns false, because the doc no longer exists,
and they get full owner access back. `AuthContext`'s forced sign-out also
stops firing.
**Fix:** same as A1: block self-delete, and have `isDisabledOwner` read a
field the user can't remove.

### A3 [High, live] A tag can be "claimed" without really claiming it
`itemOwners/{tagId}` `allow create` only checks that the tag is
`registered` and `ownerUid == caller`. It does **not** require the
matching `tags.status → 'claimed'` in the same write. An attacker who knows
a TagBack ID can create only `itemOwners/{tagId}`:
- The tag still shows **Registered** in Inventory, but nobody else can
  claim it ("already claimed"). This is squatting.
- The attacker now passes `ownsTag()`. They can:
  - write `items`
  - write `tagProfiles` (a phishing redirect on a company sticker)
  - read that tag's reports
- This also **bypasses the new "admin-managed tags can't be claimed"
  guard**, because that guard sits only on the `tags` update clause.

**Fix:** `itemOwners` create must require
`getAfter(tags/{tagId}).data.status == 'claimed'`, the same shape as the
`items` claim clause. The claim guard then covers every path.

### A4 [High, live] A new owner can read the previous owner's reports
`reports`, `chats` and `notifications` are keyed by `tagId` only. After
`releaseTag` (or re-provisioning), the next person to claim that tag passes
`ownsTag()`. They can then see every old report, including the finder's
**location**, every old chat, and every old notification.
**Fix:**
- Stamp `claimedAt` on `itemOwners` at claim time.
- In rules, allow owner reads only for docs whose `timestamp`/`createdAt`
  is after it. Owner hooks filter the same way.
- Alternative: store an `ownerEpoch` counter on `tags`, copy it onto every
  report and chat, and compare.

### A5 [Medium, live] Public writes accept unlimited extra fields
- `reports` create uses `keys().hasAll([...])`, not `hasOnly`.
  `locationNote` and `location` have no size limit.
- `chats` create is the same: a finder can pre-set `blocked`, `resolved`,
  `reviewedAt` or `unreadFor`, and `lastMessageText` has no limit.
- `notifications` create: `type` isn't limited to known values, and extra
  fields are allowed.

**Fix:** `hasOnly` field lists, with type and length checks for each field.

### A6 [Medium, live] Anyone can edit any chat's activity markers
`isChatParty()` compares the stored token with the token in the *new*
document. When the token isn't changed, that is always true. So anyone
with a chatId can:
- rewrite `lastMessageText` (shown in the owner's Messages list)
- flip `unreadFor`
- file a "finder report" on the chat

This is already documented as a known weakness, but `lastMessageText`
spoofing is a new angle.
**Fix (short term):** require `request.resource.data.lastMessageText` to
equal the latest message's text. Not possible in rules, so drop
`lastMessageText` from the finder branch and derive the preview from the
messages subcollection. **Real fix:** a finder identity signal (App Check).

### A7 [Low, live] Public tag docs show admin notes and uids
`tags` is public-read, but blacklisting writes `flagReason`,
`blacklistedBy`, and registration writes `registeredBy`. Anyone who knows
a TagBack ID can read why it was blacklisted and which admin uid did it.
**Fix:** move admin-only fields to an admin-only subcollection
(`tags/{tagId}/admin/meta`).

### A8 [Low, live] Scan counter can be spammed
`tags/{tagId}/scans` create allows any client, for any tagId (even a
nonexistent one), with any `timestamp`. Tap counts can be inflated.
**Fix:**
- require `timestamp == request.time`
- require `exists(tags/{tagId})`
- accept that it's a soft metric

---

## B. Workflow bugs (client code)

### B1 [High, live] A signed-in user can't chat as a finder
`public/Chat.jsx:75`: `role = isAdminUser ? 'admin' : user ? 'owner' :
'finder'`. Any **signed-in** TagBack user who finds someone else's item and
files a report is treated as the *owner* in the chat:
- they see "Mark as recovered"
- their messages are sent as `sender: 'owner'`
- rules reject those messages ("This device can't send messages")

Many finders will be TagBack users themselves.
**Fix:** role is `'owner'` only when `chat.tagId` is in the user's
`useOwnerTagIds`. Otherwise `'finder'`, even when signed in.

### B2 [High, live] Registering fails on stickers that already hold a non-TagBack URL
`lib/tags.js#tagIdFromNdefMessage` falls back to the **raw record text**.
For a sticker holding e.g. `https://instagram.com/x` (a factory-preloaded
URL, or a sticker written with the old "bypasses TagBack" options), that
text becomes the "tagId". `NfcRegister.jsx#findExistingRegistration` then
calls `doc(db, 'tags', 'https://instagram.com/x')`, which **throws**
(slashes make an invalid document path). The admin sees "Could not check
registration status" and **cannot register or re-register that sticker**.
This also blocks the plan's migration step for old bypass stickers.
`ClaimTag.jsx` has the same problem: the URL goes into the TagBack ID box,
and the claim fails with a confusing error.
**Fix:** only return a value that matches `/nfc/<id>` or the
`TB-XXXX-XXXX` pattern (`normalizeTagbackId`). Return `null` for anything
else.

### B3 [High, live] NFC scans never stop
`NfcRegister.jsx#startScan` and `ClaimTag.jsx#scanNfc` create an
`NDEFReader`, call `scan()`, and never abort. Consequences:
- **Register → Write:** tapping the sticker to *write* also fires the
  still-running scan's `onreading`. `findExistingRegistration` now finds
  the just-registered tag and switches the page to **"already
  registered"** in the middle of the write step.
- "Cancel" while scanning only resets the UI. The next tap still triggers
  a preview.
- Each "Start scan" adds another live reader.

**Fix:** use an `AbortController` per scan, pass `{ signal }` to `scan()`,
abort after the first reading, on Cancel, on write, and on unmount.

### B4 [Medium, live] Moderation "reported" time is always empty
`admin/Moderation.jsx:271` shows `chat.blockedAt`, but neither
`reportChat` nor `reportChatAsFinder` (`lib/ownerItems.js`) ever writes
`blockedAt`. Only the preview mocks have it.
**Fix:** write `blockedAt: serverTimestamp()` in both functions. Add
`blockedAt` to the finder-report rules clause's `hasOnly` list.

### B5 [Medium, live] Owner isn't notified of finder follow-up messages
Only the first report creates a notification (`NfcLanding.jsx`).
Later finder messages (`sendChatMessage`) only set `unreadFor`. The sidebar
badge and tab-title count (R2.5) never reflect them, so an owner who
isn't on the Messages page misses replies.
**Fix:** add `notifyOwner({ type: 'message' })` on finder sends. Rate-limit
it on the client (e.g. at most one unread `message` notification per chat).

### B6 [Medium, live] One report per chat, not one per side
`chats.blocked`, `blockedBy` and `blockedReason` are single fields. If the
owner reports first, the finder's "Report owner" button disappears
(shows "Reported"). The reverse is also true. The later report is lost,
and the owner can see that the finder reported them (the chat doc is
public).
**Fix:** separate `reportedByOwner` / `reportedByFinder` objects. Moderation
reads either.

### B7 [Low, live] Un-blacklisting can restore the wrong status
`Inventory.jsx#onConfirmBlacklist` (bulk) looks up the prior status only in
`rows`. A row found by server search (`serverMatches`) isn't in `rows`, so
it defaults to `'registered'`. Un-blacklisting a claimed tag then makes it
look claimable, while `itemOwners` still exists.
**Fix:** read the status from the tag doc inside the write (a
transaction), or from `filteredRows`.

### B8 [Low, live] Register can leave a user with no profile doc
`Register.jsx`: if `setDoc(users/{uid})` fails after
`createUserWithEmailAndPassword` succeeds, the account exists with no
profile doc. Settings' `updateDoc` then fails.
**Fix:** create the doc on first sign-in if missing (`AuthContext`).

---

## C. Tag content feature (new, uncommitted)

### C1 [Medium, new] Owner redirects can be used for phishing
Any owner can set `landingMode: 'redirect'` to any https URL. The link on
the sticker is a trusted TagBack URL (`nfc-lost-and-found.web.app/nfc/…`),
which then instantly redirects. This works as a clean phishing bouncer.
**Fix (pick one):**
- owner redirects show a 2-second "Leaving TagBack → domain" page; admin
  redirects stay direct
- restrict owner redirects to an allowlist of domains
- make redirect admin-only

### C2 [Medium, new] Owner previews count as taps
`NfcLanding.jsx` records a scan on every page load, including the
owner's "Preview tap page" and the admin's "Open" buttons.
**Fix:** skip `recordTagScan` when the viewer is signed in as the owner or
an admin, or when the page is opened with `?preview=1`.

### C3 [Low, new] Bulk content: check the rules lookup limit in production
`applyTagProfileToMany` writes up to 500 docs per batch. Each write's rules
run `ownsTag()` (a distinct `exists()` per tag) before `isAdmin()`.
Production enforces a limit on `get`/`exists` calls per request. The
emulator passed 100-tag batches, but the emulator may not enforce that
limit exactly as production does.
**Fix:**
- put `isAdmin()` first in the `tagProfiles` rule, so the per-tag lookup
  is skipped for admins
- lower the batch size to 100
- test once against production with ~50 tags

### C4 [Low, new] Tag Content list shows only the latest 100 tags
`TagContentIndex.jsx` has no "Load more" and no search besides typing an
exact ID.
**Fix:** reuse Inventory's cursor paging.

---

## D. Improvement plan for the tag content functions

1. **Security first:** C1 interstitial for owner redirects, and the A3 fix
   (otherwise the "can't claim admin-managed tags" guarantee is false).
2. **Reset content** button in the admin editor: deletes the profile, so the
   tag goes back to plain Lost & Found.
3. **Bulk from Tag Content page:** checkboxes there too, not only in
   Inventory.
4. **Change history:** append-only `tagProfiles/{tagId}/history`, with undo.
   Shows who changed what when admin and owner both edit.
5. **Scheduled redirect:** `redirectUntil`, then fall back to the profile
   (event stickers).
6. **Profile photo or logo:** needs Firebase Storage and storage rules.
7. **Per-mode analytics:** taps per day in the editor, and which mode was
   active at each tap (store `landingMode` on the scan doc).
8. **Content templates:** save a named template (e.g. "Acme event") and
   apply it from the bulk page.

---

## E. Suggested fix order

1. **A1 + A2** (live admin escalation / disable escape). Rules-only change
   plus an admin clean-up script run. Do this before anything else.
2. **A3** (claim without claiming), then **A4** (old reports visible to the
   new owner).
3. **B1, B2, B3** (finder chat, sticker registration, scan abort). Main
   flows that are broken today.
4. **B4, B5, C1, C2, A5**.
5. Remaining low items and section D improvements as time allows.

Each fix gets a rules test in `tests/firestore.rules.test.js` (A1–A5 are
all testable in the emulator) before deploy.

---

## Implementation status

All findings in sections A, B and C are fixed. From section D, items 1
(=C1), 2 (Reset content) and 3 (bulk select on the Tag Content page) are
done.

| Item | Fix |
|---|---|
| A1, A2 | `users/{uid}`: no self-delete; create rejects `disabled: true`, and `isAdmin: true` needs the passcode in `meta/adminSignup` (rules-checked). The passcode left the client bundle (`VITE_ADMIN_SIGNUP_PASSCODE` removed); admins set it on the Owners page or with `scripts/setAdminSignupPasscode.js`. `scripts/listSelfServeAdmins.js` finds accounts to review. |
| A3 | `itemOwners` create requires `tags.status → claimed` in the same write; no edits; delete only together with `→ registered`. |
| A4 | `releaseTag` deletes the tag's reports and notifications, deletes its chats, and archives reported chats (kept for moderation, hidden from owner inboxes). |
| A5 | Exact field lists and bounds on `reports`, `chats` and `notifications` creates. |
| A6 | Finder side can't write `lastMessageText`; owner inbox previews come from the real latest message. |
| A7 | Admin notes moved to admin-only `tagAdmin/{tagId}`; legacy public fields are removed when a tag is re-registered or un-blacklisted. |
| A8 | Scans: real tags only, server time only. |
| extra | `chats` list restricted to the tag owner/admin (a public list let anyone enumerate a tag's chats); `get` by id stays public for finders. |
| B1 | Chat role = owner only if the chat's tag is one of the user's tags. |
| B2 | `tagIdFromNdefMessage` returns only real TagBack IDs; `ClaimTag` validates the ID format. |
| B3 | `AbortController` on every scan (register + claim), stopped after one tap, on Cancel, on write and on unmount. |
| B4, B6 | `reportedByOwner` / `reportedByFinder` `{reason, at}`; Moderation shows both, with times. Legacy fields still read. |
| B5 | A finder message notifies the owner when the chat had no unread owner message yet. |
| B7 | Blacklist prior status looked up across loaded rows and search matches. |
| B8 | `AuthContext` creates a missing profile doc once (not during signup). |
| B9 (new) | "Mark as recovered" also closes the report — reports previously stayed `open` forever. |
| C1 | Owner-set redirects show a 5-second "You're leaving TagBack" page; admin-set ones (rules-checked `editorRole`) stay instant. |
| C2 | Editor preview links use `?preview=1`, which skips the tap counter. Scans also record the mode shown. |
| C3 | `isAdmin()` evaluated first in the `tagProfiles` rule; bulk batches of 100. |
| C4 | "Load more" on the Tag Content page. |

Tests: `tests/firestore.rules.test.js` — 50 passing (18 new for this
audit). `npm run build` clean.

**Known residual risks (unchanged by design):**
- Anyone holding a chatId can still flip `unreadFor` and file a finder
  report — finder identity is a localStorage token (needs App Check).
- A reported chat archived on release is still readable by the next owner
  through the chats list (client hides it).

**Deploy notes:**
- Rules and hosting must be deployed together.
- After deploy, self-serve admin signup is **off** until an admin sets a
  passcode on the Owners page. Existing admins are unaffected.
- Run `node scripts/listSelfServeAdmins.js` once and revoke unexpected
  admins with `scripts/revokeSelfServeAdmin.js`.

Not implemented: §D 4 (change history), 5 (scheduled redirect), 6 (profile
photo — needs Firebase Storage), 7 (per-mode analytics UI; the data is now
recorded), 8 (content templates).
