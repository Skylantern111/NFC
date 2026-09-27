# Editable NFC Content from the Console — Plan

Status: **implemented** — Phases A–E and improvements 1, 2 and 5. See
"Implementation status" at the end. Open decisions (§6) resolved with the
recommended defaults.

## Goal

Stop putting content (owner name, socials, custom URL) *onto* the NFC
sticker. The sticker holds one thing, written once and never again: the
TagBack URL `{origin}/nfc/{tagId}`. Everything a person sees after tapping
lives in Firestore. Admins edit it from the admin console, and owners from
their dashboard. A change is live on the next tap, with no rewrite and no
physical access to the sticker.

---

## 0. What exists today

- `admin/NfcRegister.jsx` `WRITE_OPTIONS` has eight options. Seven of them
  ("Website/Instagram/…/Custom URL — bypasses TagBack") write the admin's
  URL directly onto the chip. That content is frozen on the sticker: a
  change means finding the sticker and rewriting it. TagBack also loses
  the tap (no scan count, no lost-mode, no report form).
- `tagProfiles/{tagId}` already holds dynamic content: `website`,
  `instagram`, `facebook`, `linkedin`, `youtube`, `tiktok`, `contactUrl`,
  `contactEnabled` and `lostFoundEnabled`.
  - Rules: public read, write **only by the owner** (`ownsTag`). Admins
    cannot edit it.
  - Only claimed tags can have one.
- `public/NfcLanding.jsx` sends a `registered` (unclaimed) tag straight to
  the "unclaimed — claim it" state. Content on an unclaimed tag would
  never be shown.
- There is no display-name field and no redirect mode.

This plan reuses `tagProfiles` rather than adding a new collection.

---

## 1. Data model: extend `tagProfiles/{tagId}`

| New field | Type | Meaning |
|---|---|---|
| `landingMode` | `'lostfound'` \| `'profile'` \| `'redirect'` | What a tap shows. Default `'lostfound'` (today's behavior) |
| `displayName` | string, ≤ 60 | Name shown on the profile page. Typed in, **never** copied from `users/{uid}` |
| `bio` | string, ≤ 160 | Optional one-line description |
| `redirectUrl` | https URL | Target for `landingMode: 'redirect'` |
| `updatedAt` / `updatedBy` | timestamp / uid | Last edit, so the owner can see an admin edit and the reverse |

Existing social fields and `contactUrl` stay the same.

### Modes

- **`lostfound`**: the current `NfcLanding.jsx` page. Unchanged.
- **`profile`**: a digital-card page with display name, bio, social pills
  and contact link. When `lostFoundEnabled` is on, it also shows a small
  "Found this item? Report it" link.
- **`redirect`**: `NfcLanding.jsx` records the scan, then calls
  `window.location.replace(redirectUrl)`. This replaces the old "bypasses
  TagBack" chip writes, and the target stays editable.

### Safety override (important)

**When the item is in lost mode (`items.isLostMode === true`), always show
the lost-and-found page, whatever `landingMode` says.** Without this, a
finder of a lost item tapping a `redirect` sticker lands on Instagram and
never sees the report form.

---

## 2. Permissions (`firestore.rules`)

```
match /tagProfiles/{tagId} {
  allow read: if true;
  allow create, update: if (ownsTag(tagId) || isAdmin()) && publicProfileFieldsOnly();
  allow delete: if ownsTag(tagId) || isAdmin();
}
```

`publicProfileFieldsOnly()` changes:
- whitelist `landingMode`, `displayName`, `bio`, `redirectUrl`, `updatedAt`
  and `updatedBy`
- `landingMode in ['lostfound', 'profile', 'redirect']`
- `withinLength(displayName, 60)` and `withinLength(bio, 160)`
- `isHttpsUrl(redirectUrl)`
- `updatedBy == request.auth.uid`

**Admin edit of a *claimed* tag's profile.** Owner content should not be
overwritten silently. Recommendation: admins edit freely on
unclaimed/company tags. On claimed tags, the admin edit is allowed (for
moderation, e.g. removing an abusive link), but `updatedBy` is stored and
the owner's `NfcSetup.jsx` shows "Last edited by an admin". An open
decision (§6) covers the stricter "admin can only clear fields" option.

Tests in `tests/firestore.rules.test.js`:
- an admin can write a profile on an unclaimed tag
- a non-admin, non-owner cannot
- a bad `landingMode` is rejected
- a non-https `redirectUrl` is rejected
- a `displayName` over 60 characters is rejected

---

## 3. Implementation

### Phase A: public page (`public/NfcLanding.jsx`)
1. Also read `tagProfiles/{tagId}` for `registered` tags. Resolve the page
   in this order:
   1. blacklisted: existing behavior
   2. item in lost mode: lost-and-found page (§1 override)
   3. `landingMode === 'redirect'` with a valid `redirectUrl`: record the
      scan, then redirect
   4. `landingMode === 'profile'`: profile card
   5. unclaimed with no profile: existing "claim it" state
   6. otherwise: existing lost-and-found page
2. New `ProfileCard` component. Reuse the social-pill rendering already on
   the page (and the live preview in `NfcSetup.jsx`), so the three places
   look the same.
3. `recordTagScan` runs for all three modes, so redirect taps are counted
   too.

### Phase B: admin editor
1. New route `/admin/tags/:tagId` (`admin/TagContent.jsx`), linked from a
   new **"Edit content"** action on each `admin/Inventory.jsx` row.
2. Form fields:
   - mode selector: Lost & Found / Profile card / Redirect
   - display name and bio
   - social links
   - contact link
   - redirect URL
   - lost-and-found toggle

   Include a **live preview** of the page a tap would show. Move the
   form into a shared `components/TagContentForm.jsx` that the admin editor
   and the owner's `NfcSetup.jsx` both use, so the two cannot drift apart.
3. Save through `saveTagProfile` (extended with `updatedAt`/`updatedBy`).
4. Inventory: a "Content" column with the mode badge (Lost & Found /
   Profile / Redirect → domain).

### Phase C: owner dashboard (`dashboard/NfcSetup.jsx`)
Switch to the shared `TagContentForm`. Owners get the same modes and the
display name, plus the "last edited by an admin" notice.

### Phase D: simplify writing (`admin/NfcRegister.jsx`)
1. Remove the seven "bypasses TagBack" `WRITE_OPTIONS`. The write step
   always writes `tagUrl(tagId)`.
2. After a successful write, link to "Set this tag's content" →
   `/admin/tags/:tagId`.
3. Existing bypass-written stickers: rewrite them once with the TagBack
   URL (existing "Retry write" path). Then set `landingMode: 'redirect'`
   with the old URL, so taps behave the same but become editable.

### Phase E: docs
Update `ARCHITECTURE.md`: the data-model table and a "sticker holds only a
pointer" note.

---

## 4. Improvements

1. **[P1] Bulk apply.** Select many Inventory rows and apply one content
   template (e.g. a company's name, website and Instagram for 200 event
   stickers). One `writeBatch` of up to 500 documents per commit.
2. **[P1] "Save contact" button** on the profile card. It generates a
   `.vcf` (vCard) client-side from display name, contact link and
   website. Tapping a sticker then puts a contact in the phone, the
   common "digital business card" use.
3. **[P2] Profile photo or logo.** Needs Firebase Storage (upload in the
   editor, `photoUrl` on the profile) and storage rules. Kept separate
   because it adds a new Firebase product to the project.
4. **[P2] Scheduled or temporary redirect.** `redirectUntil` timestamp,
   then fall back to the profile (e.g. an event page for one weekend).
5. **[P2] Tap statistics per mode.** Admins get read access to
   `tags/{tagId}/scans`. The editor shows "N taps in the last 7 days", so
   a content change can be judged by its effect.
6. **[P3] Change history.** Append-only `tagProfiles/{tagId}/history`
   holding each saved version. Enables "undo" and shows who changed what
   when an admin and the owner both edit.
7. **[P3] Redirect interstitial option.** An optional "You are leaving
   TagBack → example.com" page for 1–2 seconds before redirect. It lowers
   phishing risk if an account with edit access is compromised.

---

## 5. Suggested order

1. Phase A and §2 rules, including the lost-mode override. This makes the
   new data usable.
2. Phase B: the admin editor. This is the feature you asked for.
3. Phase D: remove the chip-level bypass writes, since the editor
   replaces them.
4. Phase C: owners get the same form.
5. Improvements 1 and 2 (bulk apply, vCard) next. The rest as needed.

## 6. Open decisions

- **Admin edits on claimed tags:** full edit with a visible notice
  (recommended), or clearing fields only (moderation)?
- **Default mode for newly registered tags:** `lostfound` (today's
  behavior), or `profile` for company or event stock?
- **Redirect when not in lost mode:** redirect immediately (recommended,
  fastest), or always show the interstitial from improvement 7?

---

## Implementation status

Decisions taken (§6): admins may fully edit a claimed tag's content, with
a notice on the owner's page; new tags default to `lostfound`; redirects
happen immediately (no interstitial).

- **Model** — `lib/tagContent.js`: modes, field set, validation,
  `resolveLanding` (lost-mode override), `isAdminManaged`, vCard builder.
- **Rules** — `tagProfiles` writable by owner or admin, new fields
  validated; claim clause refuses an unclaimed tag whose profile is
  `profile`/`redirect`; admins can read `tags/{tagId}/scans`.
- **Phase A** — `NfcLanding.jsx` resolves blacklist → lost mode →
  redirect → profile → claim offer → lost & found. Scans are recorded for
  every mode. Unclaimed admin-managed tags show their content.
- **Phase B** — `admin/TagContent.jsx` at `/admin/tags/:tagId` (and
  `/admin/tags/bulk`). Inventory gets a Content column, an "Edit content"
  row action and a "Set content" bulk action (unclaimed tags only).
- **Phase C** — `NfcSetup.jsx` uses the shared `components/TagContent.jsx`
  form, with a "last edited by an admin" notice.
- **Phase D** — `NfcRegister.jsx` always writes the TagBack URL; the seven
  bypass options are gone; "Set tag content" link after registering.
- **Phase E** — `ARCHITECTURE.md` and `README.md` updated.
- **Improvement 1** (bulk apply), **2** ("Save contact" vCard), **5** (tap
  count in the admin editor).
- **Fix found on the way** — `saveTagProfile` merged, so a link cleared in
  the editor was never actually removed. It now replaces the document.

Tests: 10 new rules tests (32 total, all passing). `npm run build` clean.

Not implemented: improvements 3 (photo — needs Firebase Storage), 4
(scheduled redirect), 6 (change history), 7 (redirect interstitial).
Stickers already written with a bypass URL still need a one-time rewrite
("Retry write" in Inventory), then `redirect` mode with their old URL.
