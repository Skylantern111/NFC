# NFC Architecture Redesign — Implementation Plan

Status: **planning only — nothing in this document has been implemented yet.**

This plan covers moving TagBack's NFC tag identity from an admin-generated
nanoid to a hardware-verified registration model, while preserving
everything already working (auth, owner dashboard, lost mode, found
reports, anonymous chat, privacy separation, Google Maps, design system).

**Revision note:** this version replaces the earlier assumption that Web
NFC can always read the physical chip's hardware UID. It cannot be assumed
— it must be verified against the real target browser/device during
implementation, and the architecture must work correctly whether or not
that UID is exposed. See §2 for the resulting three-identifier model.

---

## 0. The identifier verification requirement

Before any registration UI is built, implementation must determine, on the
actual target environment (Android + Chrome, HTTPS), whether
`NDEFReadingEvent.serialNumber` is populated on a real physical tag tap.
This is a runtime fact to observe, not something to assume from the Web NFC
spec text. Two outcomes are possible, and the implementation must handle
both without pretending otherwise:

- **Option A — physical UID is exposed.** The reading event's
  `serialNumber` is a non-empty hex string on real hardware. It is captured
  and stored as descriptive/dedupe metadata, but it is never treated as an
  admin-typed or generated value, and never faked when absent on some other
  tag/browser combination later.
- **Option B — physical UID is not exposed** (unsupported browser,
  unsupported tag type, or the field comes back empty/undefined). The
  system does not fabricate a UID. It falls back to minting a TagBack-owned
  identifier and uses that as the registration identity instead.

Because Option A cannot be guaranteed to hold for every admin's device or
every tag family, **the implementation always mints a TagBack ID at
registration time, and treats the physical UID as optional metadata layered
on top when available** — this satisfies both options with one code path
instead of branching the whole registration flow on a capability check.
This is the synthesis this plan commits to; see §2 for the concrete schema.

---

## 1. Assessment of current implementation

### 1.1 Current NFC implementation
- `src/pages/dashboard/NfcSetup.jsx` — **owner-facing**, client-only. Calls
  `generateTagId()` (nanoid) to mint an ID, then uses `NDEFReader.write()` to
  push a `/nfc/:tagId` URL onto a physical sticker. Nothing is written to
  Firestore here — the ID only becomes real inventory once claimed.
- `src/pages/dashboard/ClaimTag.jsx` — owner-facing claim form. Has a working
  `NDEFReader.scan()` path that reads an NDEF message off a tag and
  regex-extracts a tagId from a `/nfc/([A-Za-z0-9_-]{6,})` URL pattern, with
  manual entry as fallback. This is scanning **content already written to
  the tag**, not any hardware identity.
- `src/pages/public/NfcLanding.jsx` (`/nfc/:tagId`) — the finder-facing public
  page. No NFC APIs used here (a phone's own OS handles the tap→URL open);
  this page just reads Firestore by `tagId` from the route param. This piece
  already matches the target architecture and needs no structural change.
- No code anywhere reads `NDEFReadingEvent.serialNumber`. Whether this field
  is usable at all is exactly the open question §0 requires verifying before
  the registration screen is built.

### 1.2 Current tag generation system
- `src/lib/tags.js`: `generateTagId()` = `nanoid(21)`. `generateBatch()`
  builds N of these for admin batch provisioning. `batchToCsv()` exports
  them. All three treat the nanoid as the tag's whole identity, generated
  in bulk ahead of any physical sticker existing — this is the batch-
  provisioning workflow being replaced by per-tap registration.

### 1.3 Current Firestore tag schema
```
tags/{tagId}          tagId, batchNumber, status(unclaimed|claimed|blacklisted),
                       chipType, createdAt, blacklistedFromStatus?, flagReason?,
                       blacklistedBy?, blacklistedAt?
itemOwners/{tagId}    ownerUid                                   (PRIVATE)
items/{tagId}         tagId, itemName, category, isLostMode,
                       lostMessage, rewardAmount                  (PUBLIC-SAFE)
reports/{reportId}    tagId, finderSessionToken, initialMessage,
                       locationNote, location, status, timestamp
chats/{chatId}        tagId, finderSessionToken, reportId, createdAt,
                       lastMessageAt, lastMessageText, unreadFor
chats/{chatId}/messages/{messageId}  sender, message, createdAt
notifications/{id}    type, tagId, createdAt, read, chatId?, reportId?
blockedTokens/{token}
meta/tagBatchCounter  value   (admin batch-numbering counter)
users/{uid}           email, displayName, disabled?, isAdmin?
```
The public/private split (`items` vs `itemOwners`) already matches what's
needed and is kept unchanged. Only `tags` needs new fields; no collection
needs renaming or splitting further.

### 1.4 Current claim workflow
`ClaimTag.jsx` runs a single `runTransaction`: reads `tags/{tagId}` (must
exist, must not be `blacklisted`), reads `itemOwners/{tagId}` (must not
exist — "already claimed" otherwise), then in one atomic write creates
`itemOwners/{tagId}` = `{ ownerUid }`, creates `items/{tagId}` with the
owner-entered item fields, and flips `tags/{tagId}.status` to `claimed`.
`firestore.rules` mirrors this exact transaction shape (`existsAfter`/
`getAfter` checks on `items#create` and `tags#update`). **This claim
workflow is correct and reusable as-is** — it just needs `status: 'unclaimed'`
read as `status: 'registered'` (a rename, not a redesign). The field the
user types into the claim form becomes the TagBack ID (§2), which is the
same Firestore doc id `tagId` always was — no change to the claim
transaction's shape.

### 1.5 Current admin inventory
`src/pages/admin/Inventory.jsx` — batch-generates N nanoids at once
(`onGenerate`), writes them all as `unclaimed` in one `writeBatch`, and
separately renders a live lifecycle table (search, status filter,
blacklist/unblacklist, CSV export). The **lifecycle table, search, filters,
blacklist workflow, and CSV-export-of-current-view are all fine as-is** and
will be kept. Only the left-hand "Provision a new batch" panel (batch-size
picker + `onGenerate`/`nextBatchNumber`) is being replaced — batch-minting N
identities with no physical sticker behind them has no place in this model.

### 1.6 Current security rules
Already well-shaped for this migration:
- `tags/{tagId}`: public read, admin write, plus one narrow `allow update`
  clause letting a signed-in caller flip `unclaimed→claimed` *only* alongside
  creating their own `itemOwners/{tagId}` in the same transaction. This
  clause needs a rename (`unclaimed`→`registered`) and no other change.
- `items/{tagId}`: public read; write locked to `publicItemFieldsOnly()`
  fields, create path mirrors the claim transaction. No PII fields, no
  `ownerUid`. **This already satisfies "never put ownerUid in a public
  document."**
- `itemOwners/{tagId}`: private map, admin-read for lookups, owner-only
  write. Correct as designed.
- Blacklist, moderation (`blockedTokens`), and admin-claim (`isAdmin()`)
  gating are all already correct and need no change.
- **Constraint this plan must keep respecting:** `tags/{tagId}` is
  `allow read: if true` (public — the finder page and the claim flow both
  need to check status pre-auth). Any new field added to `tags` (write
  status, physical UID, registration timestamp, chip type, etc.) is fine to
  add there *only if it carries no PII* — never add `claimedBy`/`ownerUid`
  to this document. Owner association stays exclusively in `itemOwners`,
  exactly as today. A captured physical UID is hardware metadata, not PII,
  so it is fine on this public doc — but see §7 on why UID possession must
  never function as a credential.

### 1.7 Current public NFC page
Already correct — no PII exposed, blacklist/unclaimed/not-found states
handled, report + chat creation flows are solid. No structural changes
planned; only messaging tweaks (unclaimed→registered wording) once the
status rename lands.

### 1.8 Files that must be modified
- `src/lib/tags.js` — remove bulk nanoid generation, add TagBack-ID minting
  + physical-UID-aware registration helpers.
- `src/pages/admin/Inventory.jsx` — replace batch-generation panel with
  scan-to-register workflow; status labels/filters `unclaimed→registered`;
  add write-status and physical-UID columns.
- `src/pages/dashboard/NfcSetup.jsx` — repurpose into owner NFC profile
  (see §8).
- `src/pages/dashboard/ClaimTag.jsx` — minor: claim-by-tap should prefer
  `event.serialNumber`-derived lookup when available, fall back to NDEF URL
  parsing, keep manual TagBack ID entry.
- `firestore.rules` — status rename, new admin-only locked fields on `tags`
  (including optional `physicalUid`), new `tagProfiles` collection rules.
- `firestore.indexes.json` — check if new queries (e.g. by `writeStatus`, or
  a dedupe lookup by `physicalUid`) need composite indexes.
- `ARCHITECTURE.md`, `README.md` — update tag-lifecycle description.

### 1.9 Files that can remain unchanged
`src/pages/public/NfcLanding.jsx` (structurally), `src/pages/public/Chat.jsx`,
`src/lib/finderSession.js`, `src/lib/geolocation.js`, `src/lib/moderation.js`,
`src/lib/ownerItems.js`, `src/lib/adminOwners.js`, `src/lib/categories.js`,
`src/pages/admin/Moderation.jsx`, `src/pages/admin/Owners.jsx`,
`src/pages/admin/AdminLogin.jsx`, `src/lib/adminAuth.js`, all of
`src/context`, all of `src/components/ui`, auth pages, dashboard
`Items.jsx`/`Messages.jsx`/`Notifications.jsx`, and the entire design system.

### 1.10 Architectural conflicts found
1. **Core conflict:** `generateTagId()` mints the whole identity in bulk,
   ahead of any physical sticker existing. Fix: mint a TagBack ID only at
   the moment a real physical tap is registered, and layer in a physical UID
   when the runtime environment actually exposes one (§0/§2).
2. **`NfcSetup.jsx` lets an owner mint their own nanoid and write it to a
   blank tag**, entirely bypassing admin registration/inventory. Under the
   new model this page's *purpose* (owner invents an identity) no longer
   exists. Its working `NDEFReader.write()` code is reused for the admin
   write step; the page itself becomes the owner's profile screen (§8).
3. **Batch pre-generation (`generateBatch`, `nextBatchNumber`, CSV batch
   export) is incompatible** with per-tap registration — a batch of
   identities minted before any tag is tapped is exactly the "generate
   fake identity" pattern being removed. CSV export is kept only as an
   export of *already-registered* inventory, not a provisioning mechanism.
4. **Gap:** nothing today separates admin-locked fields from owner-editable
   fields beyond the `itemOwners`/`items` split. The new `tagProfiles`
   collection (social links/website, owner-controlled) needs its own rules.
5. **New gap introduced by the hardware-identity requirement:** the system
   must never let mere possession/reading of a UID or TagBack ID act as
   authorization to claim a tag — claiming still requires an authenticated
   Firebase user going through the existing transaction (§7).

---

## 2. The three identifiers — and the target schema

Three conceptually distinct values must never be treated as interchangeable:

| Identifier | What it is | Where it lives | Stable? | Ever shown to a finder? |
|---|---|---|---|---|
| **Physical UID** | The NFC chip's own hardware serial (e.g. `04:A2:24:8B:7C:61:80`), read via `event.serialNumber` — **only if the runtime actually exposes it (§0)** | `tags/{tagId}.physicalUid`, optional/nullable | Yes, but may be `null` forever on a given tag/browser combo | No |
| **TagBack ID** | TagBack's own stable identifier for the registered asset (e.g. `TB-8K4X9C`), minted once at registration | Firestore doc id for `tags`/`items`/`itemOwners`/`tagProfiles` — i.e. this is what the codebase already calls `tagId` | Yes, for the sticker's lifetime | Yes — it's the thing in the URL |
| **NDEF URL** | The actual bytes written onto the tag, e.g. `https://tagback.app/nfc/TB-8K4X9C` | Physical tag storage only, mirrored in `tags/{tagId}.writeStatus`/`lastWrittenAt` for tracking | Yes, until deliberately rewritten | Yes — this is what a finder's phone opens |

`tagId` (the existing route param and Firestore doc id) **is the TagBack
ID**, not the physical UID. This is a refinement of the schema, not a new
decision: the physical UID is *additional* metadata captured when available,
never the primary key, because it cannot be relied on to exist for every
tag/browser combination (§0).

### 2.1 Target Firestore schema
```
tags/{tagId}                         # tagId == the TagBack ID (e.g. "TB-8K4X9C"), minted at registration
    tagId                            # == doc id
    physicalUid                      # nullable — hex UID from event.serialNumber, ONLY if the runtime exposed one
    nfcCapabilityAtRegistration      # 'uid-and-ndef' | 'ndef-only' | 'unknown' — what the registering device could actually do (audit trail, not a live capability flag)
    chipType                         # best-effort from any NDEF record present, or admin-confirmed; nullable
    status                           # 'registered' | 'claimed' | 'blacklisted'   (renamed from unclaimed)
    registeredAt                     # serverTimestamp, admin-set
    registeredBy                     # admin uid — fine on this doc, it's the admin's own uid, not the owner's
    writeStatus                      # 'not_written' | 'writing' | 'written' | 'write_failed'
    lastWrittenAt                    # serverTimestamp, set only on a confirmed successful NDEF write
    lastWriteError                   # string, set only on write_failed
    blacklistedFromStatus, flagReason, blacklistedBy, blacklistedAt   # unchanged

itemOwners/{tagId}                   # unchanged: { ownerUid }, private

items/{tagId}                        # unchanged public-safe item/lost-mode fields

tagProfiles/{tagId}                  # NEW — owner-controlled public profile add-ons
    website, instagram, facebook, linkedin, youtube, tiktok   # validated URLs, all optional
    contactEnabled, lostFoundEnabled                          # booleans
    # owner-only write (ownsTag), public read (finder page renders whichever are enabled)

reports/{reportId}, chats/{chatId}, chats/{chatId}/messages/{id},
notifications/{id}, blockedTokens/{token}, users/{uid}    # unchanged
```

### 2.2 TagBack ID format (needs confirmation)
The claim form requires a human to type this in, so it should be short and
unambiguous, but it's also a public, unauthenticated lookup key
(`/nfc/:tagId`), so it shouldn't be so short that it becomes guessable/
enumerable. Recommendation: a 10-character value drawn from an unambiguous
alphabet (no `0`/`O`, `1`/`I`/`l`), rendered grouped for readability, e.g.
`TB-K8XQ2-M4RT`. That's roughly 51 bits of entropy — far harder to enumerate
than the brief's illustrative 6-character example, while still short enough
to type from a sticker's printed label. **Flagging this for confirmation**
before implementation, alongside §2.3.

### 2.3 `meta/tagBatchCounter` — removed
No more batch numbering; registration is per-tap, not per-batch. The
`batchNumber` field on `tags` is dropped. If inventory grouping is wanted
later, group by `registeredAt` date range instead — not in this plan's
scope unless requested.

---

## 3. Firestore rules changes

- `tags/{tagId}`:
  - `allow create` — admin-only, and only when the written field set is
    exactly the registration fields (`tagId, physicalUid, chipType,
    nfcCapabilityAtRegistration, status, registeredAt, registeredBy,
    writeStatus`) with `status == 'registered'`. This also enforces a
    dedupe check for `physicalUid` server-side is **not** possible in rules
    alone (rules can't query "does another doc have this UID") — dedupe on
    `physicalUid` must happen client-side before the write, by querying
    `tags` where `physicalUid == foundUid` prior to registering (best-effort;
    a determined double-registration under a race is a data-quality issue,
    not a security one, since `physicalUid` is non-authoritative metadata).
  - Rename the existing claim-clause's `unclaimed` literals to `registered`.
  - Add an admin-only `allow update` for `writeStatus`/`lastWrittenAt`/
    `lastWriteError`, separate from the claim clause so a claiming owner's
    update (`hasOnly(['status'])`) can't be abused to also touch
    write-status fields.
  - Keep `physicalUid`/`registeredBy`/`registeredAt`/`chipType` **immutable
    after creation** by any non-admin path — the existing claim-update
    clause already enforces `hasOnly(['status'])`, so this already holds;
    just needs re-verification after the rename.
- `tagProfiles/{tagId}` (new):
  - `allow read: if true` (finder page needs to render enabled links).
  - `allow create, update: if ownsTag(tagId) && <hasOnly the profile fields>
    && <URL fields pass a basic https:// scheme check>`.
  - `allow delete: if ownsTag(tagId)`.
- Everything else in §1.6 is unchanged.

---

## 4. NFC read/write technical approach

### 4.1 Capability check (run once, surfaced to the admin, logged per registration)
Before anything else: `'NDEFReader' in window` and secure context, exactly
as this codebase already checks in `NfcSetup.jsx`/`ClaimTag.jsx`. This gates
whether the registration screen even attempts a scan, vs. immediately
showing the manual/dev fallback (§6).

### 4.2 Reading on a real tap (admin registration)
1. Admin taps "Tap NFC Sticker to Register."
2. `new NDEFReader(); await reader.scan()`; on the `reading` event:
   - Read `event.serialNumber`. **Do not assume it is populated** — check
     for a non-empty string. If present, normalize (strip colons,
     uppercase) into `physicalUid`. If absent/empty/undefined, set
     `physicalUid = null` and `nfcCapabilityAtRegistration = 'ndef-only'`;
     if present, `'uid-and-ndef'`.
   - Also inspect `event.message` for any existing NDEF record (reusing the
     existing `tagIdFromNdefMessage`-style parser) — if it already matches a
     `/nfc/<tagId>` URL for a `tags` doc that exists, this is a **re-tap of
     an already-registered sticker**, not a new one; show its existing
     record instead of offering to register again.
   - If `physicalUid` was captured, query `tags` where `physicalUid ==`
     that value, to catch the case where the sticker was registered before
     but its NDEF was blank/erased since — same "already registered"
     outcome.
3. If neither check finds an existing registration, show the read-only
   preview (`Physical UID: <value or "not exposed by this browser/tag">`,
   `NFC capability: uid-and-ndef | ndef-only`, `Chip type: <best-effort>`,
   `Status: Unregistered`) with a **Register Tag** button.
4. On confirm: mint a TagBack ID (§2.2) and create `tags/{tagId}` with the
   fields from §2.1, via a transaction that re-checks the doc doesn't
   already exist under that generated id (astronomically unlikely to
   collide, but the transaction is what makes "two admins register the same
   physical tap at once" safe rather than the UID/NDEF dedupe checks above,
   which are best-effort reads, not atomic guarantees).

### 4.3 Writing the NDEF URL (admin provisioning)
Reuses the working `NDEFReader.write()` call already in `NfcSetup.jsx`
(`ndef.write({ records: [{ recordType: 'url', data: url }] })`), moved to
the admin write step. Flow: admin picks "TagBack Lost & Found" (default/
primary) or another link type → app computes `tagUrl(tagId)` (URL built
from the TagBack ID, never the physical UID) → sets `writeStatus: 'writing'`
→ calls `write()` → on success, **read the tag back** (a second `scan()`)
to confirm the written NDEF actually round-trips before setting
`writeStatus: 'written'` + `lastWrittenAt`; on any failure (write throws, or
the read-back doesn't match), `writeStatus: 'write_failed'` +
`lastWriteError`. **Never set `written` optimistically before both the write
and the verifying read-back succeed.**

### 4.4 Claim-by-tap (owner, optional)
`ClaimTag.jsx`'s existing scan path reads NDEF *content* (the written URL),
which remains the primary tap-to-claim mechanism, since the TagBack ID (not
the physical UID) is what the claim transaction keys on. If
`event.serialNumber` is also present, it can be used as an extra sanity
cross-check against the registered `tags/{tagId}.physicalUid` (e.g. warn if
they mismatch — a sign of a mislabeled or swapped sticker), but it is never
required for the claim to proceed, and manual TagBack ID entry stays as the
non-NFC fallback — never removed.

### 4.5 Unsupported/error states
All map to explicit UI states keyed off real API outcomes, never a timer:
`'NDEFReader' in window` (support check), `scan()`/`write()` rejecting with
`NotAllowedError` (permission denied), the reading event simply never
firing (no tag detected — UI offers a manual "Stop scanning" affordance
since Web NFC has no built-in timeout event), thrown errors from `write()`
(write failed), and a failed verifying read-back from §4.3 (also
write-failed, with a distinct message: "write succeeded but could not be
verified"). No state is ever faked — every one of these is driven by an
actual API rejection, an actual absent event, or an actual read-back
mismatch.

---

## 5. Admin workflow (new pages/flow)

Merge registration + write into one screen (`/admin/nfc-register`) — a
single continuous tap→read→register→configure→write flow for one physical
interaction with one sticker:

1. **Tap NFC Sticker to Register** (idle → scanning → read).
2. **Preview**: Physical UID (or "not exposed on this device/tag" if
   absent), NFC capability, chip type (best-effort/confirm), Status:
   Unregistered → **Register Tag** button. If the tap matched an existing
   registration instead, show that record's status (Registered/Claimed/
   Blacklisted) and the current NDEF content in place of the register
   button.
3. Post-register: **Choose what to write** (TagBack Lost & Found default;
   Website/Instagram/Facebook/TikTok/LinkedIn/YouTube/Custom URL as
   alternates).
4. **Write NFC Tag** → live write status → verifying read-back → success/
   fail state.
5. Confirmation screen with the final NDEF URL, the TagBack ID (for the
   admin to hand to the user), and a "Register another" reset.

`admin/Inventory.jsx` keeps its existing lifecycle table (search/filter/
blacklist/CSV) verbatim, with:
- Status tabs renamed `Unclaimed→Registered`.
- New `Physical UID` column (shows the value or an em dash when not
  captured — never fabricated).
- New `Write status` column (Not Written / Writing / Written / Write Failed).
- `Current owner` stays admin-only and is resolved via the existing
  `findOwnerByTag` join against `itemOwners`/`users` (per §1.6's constraint
  — never denormalized onto the public `tags` doc).
- The left "Provision a new batch" card removed entirely; inventory rows
  now only ever originate from `/admin/nfc-register`.
- Development fallback: a manual "Enter TagBack ID to register (dev only)"
  input, clearly labeled, gated behind `!nfcSupported`, and it **never**
  populates `physicalUid` — that field stays `null` for anything registered
  this way, since no hardware was actually read.

---

## 6. Owner workflow changes

- **Claim** (`ClaimTag.jsx`): keep the transaction and rules exactly as-is
  (§1.4), just read `status == 'registered'` instead of `'unclaimed'`; the
  field is labeled "TagBack ID" in the UI (it already is the same value);
  add the optional serial-number cross-check from §4.4.
- **My NFC Profile** (repurposed `NfcSetup.jsx`, same route
  `/dashboard/nfc-setup`): once claimed, shows the TagBack ID (read-only),
  item name (read-only here, editable on `Items.jsx` — avoid duplicating
  that edit surface), and the `tagProfiles/{tagId}` toggles/fields
  (website/instagram/facebook/linkedin/youtube/tiktok/contact) with URL
  validation before save. Any `tags/{tagId}` admin fields (including
  `physicalUid`) are rendered read-only, never as editable inputs, on this
  page.

---

## 7. Security requirement: UID/TagBack ID possession is never authorization

Reading a physical UID off a tag, or knowing/typing a TagBack ID, must never
by itself grant ownership. The existing claim transaction already enforces
this correctly (authenticated Firebase user + `itemOwners` create + `tags`
status flip, all in one atomic write, per §1.4) — this section is a
guardrail on the *new* fields, not a redesign of claiming:
- `physicalUid` is stored purely as descriptive/dedupe metadata on the
  admin-only-writable `tags` doc. It is never checked as a credential
  anywhere in the claim path.
- A finder who taps a tag and lands on `/nfc/:tagId` reads only the public
  `items`/`tagProfiles` documents — never `tags.physicalUid`, never
  `itemOwners`, never anything from `users`. (No rules change needed here;
  `tags` is already public-read for status only, and nothing in this plan
  adds PII to it.)
- No NDEF payload ever contains email, phone, address, or a Firebase UID —
  only the stable `/nfc/<tagbackId>` URL.

---

## 8. What happens to `NfcSetup.jsx`

Its two working pieces — the Web-NFC write call and the "simulate tap /
preview finder page" affordance — are worth reusing; its core purpose
(owner mints an ID) is not. Plan: **repurpose this file in place** into the
"My NFC Profile" screen from §6, dropping `generateTagId()`/the "Generate
NFC ID" button entirely, keeping the route (`/dashboard/nfc-setup`). No new
file needed; no old file deleted.

---

## 9. Finder workflow

No changes required — already correct. Only copy tweaks: the `unclaimed`
empty-state on `NfcLanding.jsx` should read "registered but not yet
claimed" language consistent with the renamed status.

---

## 10. Routing changes

```
/admin/nfc-register     NEW  — merged register+write flow (§5)
/admin/inventory        KEPT — batch-provisioning panel removed, columns updated
/dashboard/nfc-setup    KEPT (repurposed) — owner NFC profile (§6/§8)
/dashboard/items/claim  KEPT — unchanged route, minor internal logic update
```
No routes removed. A separate `/admin/nfc-write` route is intentionally not
created — merged into `/admin/nfc-register`.

---

## 11. Phased implementation order

0. **Capability verification (§0)**: on the real target device/browser,
   confirm whether `event.serialNumber` is actually populated on a tap of
   the specific NTAG chips being used. Record the result — this determines
   whether `nfcCapabilityAtRegistration` will realistically read
   `uid-and-ndef` or `ndef-only` in practice, but does **not** change the
   schema or code path either way (§0's synthesis already covers both).
1. **Schema + rules**: update `firestore.rules` (status rename, registration
   create-clause, write-status update-clause, `tagProfiles` rules), update
   `firestore.indexes.json` if a composite index is needed for the write-
   status filter or the `physicalUid` dedupe lookup.
2. **Admin NFC register+write** (`/admin/nfc-register`): UID-if-available
   capture, NDEF/UID dedupe detection, transactional registration, write
   flow with verifying read-back, error states — all real Web NFC calls,
   no simulation.
3. **Admin inventory update**: remove batch-provisioning panel, rename
   status labels, add physical-UID and write-status columns.
4. **Owner claim update**: rename status check, add optional serial-number
   cross-check in `ClaimTag.jsx`.
5. **Owner NFC profile**: repurpose `NfcSetup.jsx` per §6/§8, wire up
   `tagProfiles/{tagId}` CRUD with URL validation.
6. **Finder page copy tweak**: `NfcLanding.jsx` unclaimed-state wording only.
7. **Cleanup**: remove `generateTagId`/`generateBatch`/`nextBatchNumber`/
   batch CSV from `src/lib/tags.js`, keep `tagUrl`/inventory-view CSV
   export/`TAG_STATUS_BADGE` (retargeted to new status set).
8. **Docs**: update `ARCHITECTURE.md`/`README.md` tag-lifecycle sections;
   remove any "admin generates tag IDs" language; document the
   three-identifier model from §2.
9. **Testing pass** (maps to brief's Tests A–E):
   - **Test A (registration)** — real tap on an unregistered sticker,
     confirm what the browser actually exposes, confirm the Firestore
     record and its appearance in inventory.
   - **Test B (writing)** — write, then read the tag back independently to
     confirm the NDEF content actually matches.
   - **Test C (claiming)** — hand the sticker's TagBack ID to a test user
     account, confirm ownership association, confirm admin-locked fields
     reject a client-side write attempt.
   - **Test D (finder)** — a plain phone tap with the admin interface
     closed, confirm the OS opens the URL with no login, confirm private
     owner data never appears, confirm report + chat still work.
   - **Test E (unsupported device)** — a browser without Web NFC shows the
     clear fallback message, never a silent failure or a fake success.

---

## 12. Known limitations / requires physical hardware to verify

- Whether `event.serialNumber` is populated is a fact about the actual
  Android/Chrome version and the specific NTAG family in use — **not
  something this plan can assert in advance**. The architecture is designed
  to be correct either way (§0), but the admin-facing "Physical UID" field
  may read "not exposed by this browser/tag" on every registration done in
  this project, and that must be presented as normal, not as an error.
- Web NFC has no simulated/mocked path in this plan — admin registration
  and write features **cannot be manually tested on desktop**; only the
  manual-TagBack-ID dev fallback and the claim/rules/finder flows can.
- The verifying read-back in §4.3 adds a second scan step to the write
  flow; real-world latency/UX of "tap again to verify" needs a hands-on
  check, not just a code review.
- Duplicate-registration race handling (two admins tapping related stickers
  at once) needs a real transaction test, not just code review.

---

## 13. Open questions — resolved, implementation status

Both open questions were resolved by the project owner and implemented:

1. **§2.2 TagBack ID format** — resolved as `TB-XXXX-XXXX`, drawn from an
   unambiguous 31-character alphabet (`23456789ABCDEFGHJKMNPQRSTUVWXYZ` —
   no `0`/`O`, `1`/`I`/`L`). Implemented in `src/lib/tags.js`
   (`generateTagbackId`/`normalizeTagbackId`).
2. **§4.3 write verification** — resolved as **no mandatory verifying
   read-back**. `writeStatus` is set from the `NDEFReader.write()` Promise
   outcome alone: `written` on resolve, `write_failed` + the caught error on
   reject. Implemented in `src/pages/admin/NfcRegister.jsx#onWriteTag`.

### Implementation status (Phases 1–8 of §11)

- **Phase 1 (schema + rules)** — done. `firestore.rules`: `tags` status
  renamed `unclaimed→registered` throughout, header comment and `tags`
  match block document the physical-UID/TagBack-ID distinction,
  `tagProfiles` collection added with `publicProfileFieldsOnly()` +
  `isHttpsUrl()` validation, `meta/tagBatchCounter` comment retired (no
  rules change needed — counter usage removed at the code level, not the
  rules level). `firestore.indexes.json` needs no change — every new query
  (`physicalUid ==`, `registeredAt` order) is single-field.
- **Phase 2 (admin register+write)** — done. `src/pages/admin/NfcRegister.jsx`
  (new): tap→read→dedupe-check→register→write, `/admin/nfc-register` route
  + sidebar entry, dev-only fallback clearly tagged
  `nfcCapabilityAtRegistration: 'dev-fallback'`.
- **Phase 3 (admin inventory)** — done. `src/pages/admin/Inventory.jsx`:
  batch-provisioning panel removed, status tabs renamed, `Physical UID` +
  `Write status` + on-demand `Owner` (admin-only, joined via
  `lib/adminOwners.js#findOwnerByTag`, never denormalized onto `tags`)
  columns added, CSV export retargeted (`lib/tags.js#inventoryToCsv`).
- **Phase 4 (owner claim)** — done. `src/pages/dashboard/ClaimTag.jsx`:
  shared `tagIdFromNdefMessage` moved to `lib/tags.js`, entered id
  normalized via `normalizeTagbackId` before the claim transaction, field
  labeled "TagBack ID." The optional serial-number cross-check from §4.4
  was **not** added — flagged as a nice-to-have, not implemented (see §12
  addendum below).
- **Phase 5 (owner NFC profile)** — done. `src/pages/dashboard/NfcSetup.jsx`
  fully repurposed (`?tagId=` query param, linked from a new "NFC profile"
  link per item in `Items.jsx`): admin-locked fields rendered read-only,
  `tagProfiles/{tagId}` CRUD via new `lib/ownerItems.js#getTagProfile`/
  `saveTagProfile` helpers, client-side https:// validation mirroring the
  rules check. The owner-side `NDEFReader.write()` call was **removed
  entirely** (not just de-emphasized) — see §12 addendum.
- **Phase 6 (finder copy)** — done, and extended slightly beyond copy: the
  public page (`NfcLanding.jsx`) now also reads `tagProfiles/{tagId}` and
  renders any enabled social links, and hides the report/chat form when an
  owner has explicitly set `lostFoundEnabled: false`. This wasn't strictly
  scoped to "copy tweak" in §9, but the profile fields need to actually
  surface somewhere for the feature to mean anything — flagged here rather
  than silently expanding scope.
- **Phase 7 (cleanup)** — done. `generateTagId`/`generateBatch`/
  `nextBatchNumber`/batch-shaped `batchToCsv` removed from `lib/tags.js`;
  replaced with `generateTagbackId`/`normalizeTagbackId`/
  `normalizePhysicalUid`/`tagIdFromNdefMessage`/`inventoryToCsv`.
  `admin/Owners.jsx`'s stale `TAG_STATUS_BADGE.unclaimed` reference fixed
  to `.registered`.
- **Phase 8 (docs)** — done. `ARCHITECTURE.md` §5/§7/§8 and `README.md`'s
  feature list, data-model table, and build-status section updated to
  describe the hardware-identity flow and drop "admin generates tag IDs"
  language.
- **Phase 9 (testing)** — **not done**. See §12 — this requires a physical
  NFC-capable Android/Chrome device the implementation session didn't have
  access to. `npm run build` passes cleanly with no import/reference errors
  across all touched files, which is the extent of verification possible
  without hardware.

### §12 addendum — two deliberate scope decisions made during implementation

1. The optional serial-number cross-check in claim-by-tap (§4.4, "warn if
   `physicalUid` mismatches") was left out. It's explicitly optional in this
   plan ("never required for the claim to proceed"), and adding it would
   have meant surfacing a new warning UI for a comparison that only matters
   once real hardware testing (Phase 9) is possible anyway. Can be added
   later without touching rules or the claim transaction.
2. `NfcSetup.jsx`'s owner-facing `NDEFReader.write()` call was removed
   rather than kept "for dev/testing" as §8 originally allowed. Reasoning
   added during implementation: letting an owner write arbitrary NDEF
   content to a tag whose identity is admin-registered creates a path where
   the physical sticker's content silently diverges from what the admin
   console believes was written (`tags/{tagId}.writeStatus`), with no
   record of the owner's write anywhere. Since §5/§7 of this plan already
   make NDEF writing an admin-only operation in the primary flow, removing
   the owner path entirely (rather than downgrading it to "dev-only")
   keeps `writeStatus` truthful. Flagging this as a decision made without
   re-confirming with the project owner, since it's a stricter reading of
   "primary write path moves to admin" than the plan text technically
   required.
