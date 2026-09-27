# Tag Content Beyond Registered Stickers — Plan

Status: **planning only, not implemented.** Date: 2026-09-27.

## Goal

The Tag Content page (`/admin/tags`) lets an admin choose what a tap shows,
but only for a **registered NFC sticker**: every row starts from a physical
tap at NFC Register. The goal is the same content system (Lost & Found
page, profile card, redirect) for things that are **not a registered
TagBack sticker**:

- a **QR code** (printed, on a card, on a screen)
- a **plain link** (bio link, email signature, poster)
- **any NFC chip the owner already has** (their own sticker, card, phone
  case, keychain), written by the owner without an admin registering it

Everything else stays the same: one TagBack ID, one `/nfc/:tagId` URL, one
`tagProfiles/{tagId}` doc, and edits apply on the next scan or visit.

---

## 0. Why this is mostly reuse

- The public page (`NfcLanding.jsx`) only needs a `tags/{tagId}` doc and a
  `tagProfiles/{tagId}` doc. Nothing there depends on NFC hardware.
- `NfcRegister.jsx` already has a "dev fallback" that creates a tag doc
  with no physical tap (`nfcCapabilityAtRegistration: 'dev-fallback'`).
  That is the same idea, currently hidden as a testing tool.
- The claim flow, Tag Content editor, bulk apply, tap counter and
  moderation all key on `tagId`, not on the chip.

So the core change is one new field on `tags` saying **what kind of thing
the ID is attached to**, plus a way to create IDs without a tap.

---

## 1. Data model

New field `tags/{tagId}.kind`:

| kind | Created by | Physical? | Notes |
|---|---|---|---|
| `nfc` | Admin, at NFC Register (tap) | Yes | Today's stickers. Missing `kind` = `nfc` (no migration). |
| `qr` | Admin, "New QR / link" | Printed | Same URL, shown as a QR code. |
| `link` | Admin, "New QR / link" | No | Same URL, used as a plain link. |
| `owner-nfc` | Owner, "Use my own NFC chip" | Owner's chip | Owner writes the URL to their own chip (§3.3). |

`physicalUid` stays `null` for everything except `nfc`. The dev-fallback
tags get `kind: 'link'` going forward.

Scans record where the visit came from: `tags/{tagId}/scans` gets an
optional `source` (`nfc` | `qr` | `link`), taken from a `?src=` parameter
that each kind's URL carries (`/nfc/TB-…?src=qr`). The scans rule's
`hasOnly` list gets `source` as one more optional key, next to
`landingMode`.

---

## 2. Admin console changes

### 2.1 "New QR / link" on the Tag Content page
- A button next to "Open editor": pick **QR code** or **Link**, and how
  many (1–100).
- Mints TagBack IDs with the existing `generateTagbackId()` in one batch,
  `status: 'registered'`, `kind` set, `registeredBy` in `tagAdmin` (A7).
- Opens the editor for one ID, or the bulk editor for many. The admin
  sets content right away.

### 2.2 List changes (`TagContentIndex.jsx`)
- New **Kind** column with an icon (NFC / QR / Link / Owner chip).
- Filter chips by kind, next to the mode filters.
- Row actions:
  - **QR**: opens a dialog with the QR code, a **Download PNG** button
    and the link. Available for every kind, so NFC stickers can also get
    a printed QR fallback.
  - **Copy link**.

### 2.3 Printable sheet
- Select rows → **Print QR sheet**: a print-ready page (`/admin/tags/print`)
  with a grid of QR codes, each with its TagBack ID underneath (the ID is
  what an owner types to claim). Uses the browser's print dialog.

### 2.4 Inventory
- Inventory stays about **stock**, so it shows all kinds, with a Kind
  column and filter.
- "Retry write" and "Re-register" stay NFC-only.

---

## 3. Owner-side changes

### 3.1 Claim works for every kind
No change needed: an owner claims a QR or link ID exactly like a sticker,
by typing or scanning the TagBack ID. Scanning a QR opens `/nfc/:tagId`,
which already shows "Claim this tag" for an unclaimed tag.

### 3.2 QR and link for an owner's own items
On **My NFC Profile** (`NfcSetup.jsx`), next to "Preview tap page":
- **Show QR code** (download PNG), for printing a backup label.
- **Copy link**.

### 3.3 "Use my own NFC chip" (`owner-nfc`)
For an owner who already has an NFC sticker, card or keychain:
- On **My NFC Profile**, a **Write to my own NFC chip** button (Android
  Chrome only, same Web NFC as admin). It writes `tagUrl(tagId)` to any
  chip the owner taps. This works for a tag the owner already claimed. The
  chip becomes a second way into the same page.
- **Without buying a TagBack sticker at all:** the owner gets a new ID
  from **My Items → Add item without a sticker**. That is a self-serve
  create (§4.2). They then write it to their own chip, or use it as QR or
  link.

---

## 4. Rules (`firestore.rules`)

### 4.1 Admin creates any kind
`tags` stays `allow write: if isAdmin()`. Add a check on create:
`kind in ['nfc', 'qr', 'link']`, or absent. `physicalUid` must be null
unless `kind` is `nfc`.

### 4.2 Owner self-serve create (optional — decision in §6)
One new clause: a signed-in, non-disabled user may create a
`tags/{tagId}` doc **only** as follows, in the same transaction:
- `kind == 'owner-nfc'` or `'qr'` or `'link'`
- `status == 'claimed'`
- `physicalUid == null`
- the ID matches the `TB-XXXX-XXXX` format
- `itemOwners/{tagId}` is created with `ownerUid == request.auth.uid`
- `items/{tagId}` is created

The existing `itemOwners` create clause needs an extra branch for this
(its current branch requires the tag to be `registered` before the
write).

**Abuse limit:** rules can't count an owner's tags. Options:
- a per-user counter doc (`users/{uid}.selfServeTags`), incremented in the
  same transaction and capped in rules (e.g. ≤ 20)
- admin approval of each new ID

Recommended: the counter.

### 4.3 Scans
Allow the optional `source` key (`nfc` | `qr` | `link`).

---

## 5. Implementation phases

1. **Kind + admin QR/link creation.**
   - `kind` field and rules check; show missing `kind` as `nfc`.
   - "New QR / link" on Tag Content.
   - Kind column and filters.
   - QR dialog, with a small QR library bundled into the admin chunk,
     e.g. `qrcode` (npm).
2. **QR everywhere.** QR and copy link for every row, and on the owner's
   NFC profile. `?src=` on URLs, `source` on scans.
3. **Print sheet** for many QR codes.
4. **Owner writes own chip.** "Write to my own NFC chip" on NFC profile
   for already-claimed tags. No rules change.
5. **Owner self-serve IDs** (§4.2) — only if approved in §6. Rules clause,
   counter cap, "Add item without a sticker" flow, and rules tests
   (success, cap, wrong owner, wrong status).
6. **Stats by source.** Taps split into NFC / QR / link in the editor (uses
   the `source` + `landingMode` already recorded).

Each phase is shippable alone. Phases 1–4 need no change to the owner
trust model.

---

## 6. Open decisions

1. **Owner self-serve IDs (§4.2):** allow owners to create their own IDs
   without a TagBack sticker? Yes means more reach, but a new abuse surface
   (capped by the counter). No means only admins mint IDs, and owners use
   QR/link/own-chip only on tags they claimed.
2. **Tap-page wording by kind:** the finder page says "You found …" and
   the tag is often called a "sticker". For `link` pages, "tag" wording may
   read oddly. Adjust copy by `kind`, or keep one wording?
3. **Label content:** should the printed QR label also show a short
   instruction ("Scan to return this item") and the TagBack ID? Recommended
   yes: the ID is what a new owner claims with.
