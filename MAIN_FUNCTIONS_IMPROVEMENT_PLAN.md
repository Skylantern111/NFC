# Main Functions — Improvement Plan

Status: **implemented.** §1.1, §1.2, §2.1, §3.1, §3.2, §4.1, §5.1, and §6.2
below are done, verified by `npm run build` and (for §6.2) an actual
Firestore-emulator test run — see the "Implementation status" note at the
end of each item and the summary at the bottom of this file. §2.2, §5.2,
and §6.1 remain open — they need either external service enrollment
(Firebase App Check) or a diagnostic pass this session didn't have the
budget for, not just more code.

Scope: concrete, code-grounded gaps found in TagBack's main functions
(NFC registration/write, claim, owner dashboard, finder public page,
chat/moderation, admin inventory) while working on the hardware-identity
rearchitecture (see `NFC_REARCHITECTURE_PLAN.md`) and the recent UI-bug
pass. Every item below traces to a specific file/behavior already in the
repo — nothing here is speculative "nice to have."

Priority key: **P1** noticeable gap in a main flow, worth doing soon.
**P2** real but lower-impact or higher-effort. **P3** cross-cutting/infra,
do opportunistically.

---

## 1. NFC registration & write (`admin/NfcRegister.jsx`, `admin/Inventory.jsx`)

### 1.1 [P1] No way to re-register a swapped/damaged sticker
If a physical sticker is lost, damaged, or swapped, there's no admin flow
to re-point an existing TagBack ID at a *new* physical tap. Today the only
path is registering a brand-new TagBack ID for the new sticker, which
orphans the old one (still `claimed`, still pointing nowhere) and forces
the owner to re-claim under a new ID, losing their `tagProfiles`/`items`
association unless manually re-linked.
**Improvement:** an admin action on an existing `claimed` row in
`admin/Inventory.jsx` — "Re-register physical sticker" — that re-runs the
tap-and-read flow but writes the *new* `physicalUid`/`nfcCapabilityAtRegistration`
onto the **same** `tagId` doc instead of minting a new one, then re-writes
the (unchanged) TagBack URL to the new sticker. Keeps `items`/`itemOwners`/
`tagProfiles` intact.

### 1.2 [P1] No inline retry for `write_failed` tags
A tag that failed to write (`writeStatus: 'write_failed'`) just sits in
`admin/Inventory.jsx` with a badge — the only way to retry is going back to
`/admin/nfc-register` and re-registering from scratch, which the flow
doesn't actually support for an already-registered tag (it always mints a
new id).
**Improvement:** a "Retry write" row action on `admin/Inventory.jsx` for
`write_failed`/`not_written` tags that jumps straight to the write step of
`NfcRegister.jsx` for that specific existing `tagId`, skipping registration.

### 1.3 [P2] Dedupe check races are unaudited
`onRegister` in `NfcRegister.jsx` guards against a same-instant double
registration via a transaction, but the earlier NDEF/physicalUid dedupe
*read* is best-effort (not transactional) — flagged in the plan already,
never verified against real concurrent admin usage. Low priority unless
multiple admins actually register in parallel.

---

## 2. Claim (`dashboard/ClaimTag.jsx`)

### 2.1 [P2] Serial-number cross-check still not implemented
`NFC_REARCHITECTURE_PLAN.md §4.4/§13` flagged this as optional and
deliberately skipped. Still open: warn (don't block) if a tap-scanned
`event.serialNumber` doesn't match the registered `tags/{tagId}.physicalUid`
— catches a mislabeled/swapped sticker at claim time instead of only at
finder-tap time.

### 2.2 [P2] No abuse resistance on repeated claim attempts
Claiming only requires a signed-in Firebase account and reading/guessing a
TagBack ID (~40 bits of entropy, `TB-XXXX-XXXX`). Nothing rate-limits
repeated `tags/{tagId}` reads or claim attempts from one account — a script
could enumerate the ID space at whatever rate Firestore quotas allow.
**Improvement:** Firebase App Check on the claim path, and/or a
client+rules-level cooldown after N failed claim attempts per account.

---

## 3. Owner dashboard (`dashboard/NfcSetup.jsx`, `dashboard/Items.jsx`)

### 3.1 [P1] No live preview of the NFC profile before saving
`NfcSetup.jsx` has a "Preview finder page" link, but it opens the
*currently-saved* `/nfc/:tagId` page in a new tab — editing a link field
and wanting to see how it'll render means save-then-preview, not preview-
as-you-type. Minor but real friction on the one page whose whole point is
"configure what the finder sees."
**Improvement:** render the enabled-links pill row inline on the profile
form itself (reusing the same rendering as `NfcLanding.jsx`), live from
form state, before saving.

### 3.2 [P1] No way to release/unlink a tag
Once claimed, there's no owner-facing "release this tag" (e.g. sold the
item, tag physically destroyed). The only Firestore paths that touch
`itemOwners`/`tags.status` are the claim transaction and admin blacklist —
nothing lets an owner voluntarily hand a tag back to `registered` status so
someone else (or the admin) can re-provision it.
**Improvement:** an owner-initiated "release tag" action (deletes
`itemOwners/{tagId}`+`items/{tagId}`, flips `tags.status` back to
`registered`) — needs a new `firestore.rules` clause, since today only
`ownsTag()` can update/delete `items`/`itemOwners`, and nothing resets
`tags.status` on release.

### 3.3 [P3] Social link fields aren't validated beyond "starts with https://"
`tagProfiles` accepts any `https://` URL in any field — nothing checks
that the "Instagram" field actually points at instagram.com, etc. Low
priority (not a security issue, `firestore.rules#isHttpsUrl` already blocks
non-https), but a mistyped/mismatched link currently saves silently.

---

## 4. Finder public page (`public/NfcLanding.jsx`)

### 4.1 [P2] `tags/{tagId}/scans` is fully unused dead functionality
`firestore.rules` has a whole match block for an anonymous tap counter
(`allow create` public, `allow read` owner-only, immutable) — **but no code
anywhere writes to it.** `grep` across `src/` confirms zero references
outside `firestore.rules` itself. Either:
- implement it: `NfcLanding.jsx` writes a `scans/{scanId}` doc
  (`{timestamp, roughLocation?}`) on every real tap, and a small "N taps"
  stat surfaces somewhere in the owner dashboard/admin inventory, or
- remove it: delete the dead rules block and drop it from
  `ARCHITECTURE.md`'s data-model table if it's not planned.
Leaving it half-built (rules exist, no writer, no reader UI) is the
concrete problem — pick one side.

### 4.2 [P3] No rate limiting on public report/chat/message creation
`reports`, `chats`, and `chats/{id}/messages` all allow unauthenticated
`create` from any browser hitting a valid, non-blacklisted `tagId`. Nothing
stops a script from flooding an owner's notifications. Moderation.jsx's
existing ban-by-token is the only backstop, and it's already documented in
that file as weak (`localStorage`-scoped, trivially reset). Firebase App
Check on these three write paths would meaningfully raise the bar without
requiring finder accounts.

---

## 5. Chat & moderation (`public/Chat.jsx`, `admin/Moderation.jsx`)

### 5.1 [P2] Finder has no reciprocal "report the owner" path
Already self-documented in `Chat.jsx` ("Known scope gap... a finder has no
reciprocal way to flag an abusive owner"). Only the owner can Report a
chat. A finder harassed or scammed by an owner has no in-app recourse.
**Improvement:** a lightweight "Report this owner" affordance on the
finder's `Chat.jsx` view, writing to a new admin-read collection (or
reusing `chats.blocked` with a `blockedBy: 'finder'` field so
`Moderation.jsx` can distinguish direction).

### 5.2 [P2] Ban identity is weak by design, undocumented mitigation path
`Moderation.jsx`'s own comment: banning `finderSessionToken` is trivially
bypassed by clearing site data or switching browsers. This plan doesn't
propose a fix (needs a real identity signal — Firebase App Check attestation
or a coarse device/IP heuristic), but it should be tracked as a known
security-adjacent gap rather than left as a comment only maintainers read.

---

## 6. Cross-cutting

### 6.1 [P3] Main JS bundle exceeds Vite's 500KB warning threshold
Every `npm run build` in this session printed:
```
dist/assets/index-*.js   973.18 kB │ gzip: 256.82 kB
(!) Some chunks are larger than 500 kB after minification.
```
`App.jsx` already lazy-splits dashboard/admin routes (per its own
comments, referencing IMPROVEMENT_PLAN.md Round 9), but the shared
`index-*` entry chunk itself is still ~973KB. Likely candidates: Firebase
SDK surface (Firestore+Auth pulled in full), Radix UI primitives, Recharts
(used only in admin, could move fully behind the existing admin lazy
boundary if it isn't already). Needs a bundle analyzer pass
(`rollup-plugin-visualizer` or similar) before guessing further —
listed here as a known issue, not a diagnosed one.

### 6.2 [P3] Zero automated tests in the repository
`find . -iname "*.test.*" -o -iname "*.spec.*"` returns nothing project-wide.
Every change this session (rules rename, claim transaction, admin
registration) was verified by `npm run build` (catches import/reference
errors only) plus manual code reading — never by an actual test run. Given
how much of this app's correctness lives in Firestore transaction shape and
rules interaction (claim, registration dedupe, blacklist), that's the
highest-leverage place to start: `@firebase/rules-unit-testing` against the
Firestore emulator for `firestore.rules`, then component/integration tests
for the claim and registration transactions specifically.

---

## Implementation summary

Implemented, in the order actually done (schema/rules first, then the
pages that depend on them):

- **firestore.rules**: added the `tags` release clause (claimed→registered,
  mirrors the claim clause), and a `chats` finder-report clause
  (`blockedBy: 'finder'`). Verified compiling via `firebase deploy --only
  firestore:rules --dry-run` and by the new emulator test suite below.
- **§6.2 tests**: `tests/firestore.rules.test.js` (new), run via `npm test`
  → `firebase emulators:exec --only firestore "vitest run"`. Added `vitest`
  + `@firebase/rules-unit-testing@4.0.1` (pinned to the `4.x` line — the
  latest `5.x` requires `firebase@^12`, this project is on `^11`) as
  devDependencies. **16/16 tests pass against the real emulator** — covers
  admin-only registration, the claim transaction's three failure modes,
  release (owner-only, mirrors claim), `tagProfiles`' https/field-whitelist
  validation, and both directions of the chat-report clause (including a
  test that documents — not hides — the pre-existing `isChatParty()`
  token-tautology limitation described in that rule's comment).
- **§1.1/§1.2** (`admin/NfcRegister.jsx`, `admin/Inventory.jsx`): the page
  now accepts `?reregister=<tagId>` (re-tap a replacement sticker, updates
  the existing TagBack ID's `physicalUid`/`chipType`/`nfcCapabilityAtRegistration`,
  resets `writeStatus`, leaves `status`/items/itemOwners untouched) and
  `?rewrite=<tagId>` (skip straight to the write step for an existing tag,
  no new tap). `Inventory.jsx` rows get "Retry write" (shown for
  `write_failed`/`not_written`) and "Re-register" actions linking there.
- **§2.1** (`dashboard/ClaimTag.jsx`): tap-to-claim now also captures
  `event.serialNumber` when present and, after a successful claim, warns
  (non-blocking, `toast.warning`) if it doesn't match the registered
  `physicalUid`.
- **§3.1** (`dashboard/NfcSetup.jsx`): a live pill-row preview of enabled
  social links now renders from current form state, before saving.
- **§3.2** (`lib/ownerItems.js#releaseTag`, `dashboard/Items.jsx`): new
  owner-facing "Release tag" action (destructive-confirm dialog) — deletes
  `itemOwners`/`items`/`tagProfiles` and flips `tags.status` back to
  `'registered'` in one transaction, backed by the new rules clause above.
- **§4.1** (`lib/ownerItems.js#recordTagScan`/`getTagScanCount`,
  `public/NfcLanding.jsx`, `dashboard/Items.jsx`): resolved as *implement*,
  not delete — a real tap now writes to `tags/{tagId}/scans` (best-effort,
  never blocks the finder's page), and each item in `Items.jsx` shows its
  tap count when non-zero.
- **§5.1** (`public/Chat.jsx`, `admin/Moderation.jsx`, `admin/Owners.jsx`):
  finders now have a "Report owner" button (mirrors the owner's existing
  "Report"). `Moderation.jsx` distinguishes `blockedBy: 'finder'` rows with
  a badge and swaps the row action from "Ban token" (which would punish
  the reporter, not the reported owner) to a "Look up owner" link into
  `admin/Owners.jsx`, which now accepts `?tagId=` and auto-runs the lookup.

Not implemented — deliberately out of scope for this pass:

- **§2.2** (App Check / claim rate-limiting) — needs Firebase console
  enrollment (reCAPTCHA/App Check site registration), not something a code
  change alone can turn on.
- **§5.2** (stronger finder ban identity) — no fix proposed in the original
  plan either; still just tracked, not solved.
- **§6.1** (bundle size) — investigated enough to rule out the obvious
  cause (Recharts/admin code already behind the existing lazy boundary,
  confirmed in `App.jsx`); the remaining ~974KB is most likely the
  Firebase SDK surface plus always-eager public routes, but that needs an
  actual bundle-analyzer pass to diagnose further, not a guess-and-check
  edit.

Build verified clean (`npm run build`) after every change above; rules
verified twice — once by `firebase deploy --only firestore:rules --dry-run`
and once, far more meaningfully, by the new test suite actually exercising
them against a real emulator.
