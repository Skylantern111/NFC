# TagBack — NFC Lost &amp; Found

Physical-to-digital lost property recovery. Owners stick an NFC tag on a
belonging; if it's lost, whoever finds it taps the tag with their phone,
lands on a privacy-shielded web page (no app install), and can message the
owner and share a location — all without either party ever seeing the
other's name, phone, email, or address. Identity stays separated at the
database level, not just hidden in the UI.

Stack: React + Vite, Tailwind (light neumorphism + glassmorphism), Firebase
(Firestore + Auth), React Router, Google Maps, Recharts, nanoid.

For how the pieces fit together (routing, data layers, Firestore schema,
security rules, NFC write flow) see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## System functions

**Core (implemented):**
- Owner account (email/password via Firebase Auth).
- Claim a registered NFC tag to an item (name, category) via NFC tap or by entering its TagBack ID.
- Arm / disarm "Lost Mode" on an item, with a message to the finder and an optional reward.
- Public tap page: anyone who taps a tag sees item status, the owner's enabled social links, and can file a "found it" report with a message and optional GPS location.
- My NFC Profile page: configure social links/contact/lost-found visibility for a claimed tag (`tagProfiles/{tagId}`) — the physical tag identity itself is admin-registered, not owner-editable.
- Anonymous two-way chat between owner and finder, keyed by a private session token (finder) / Firebase Auth (owner) — never by contact info.
- Mark an item "Recovered" from chat, closing the report and clearing Lost Mode.
- Admin: register physical NFC stickers by tapping them (reads the chip's hardware UID when the browser exposes one, mints a stable TagBack ID either way — see [`NFC_REARCHITECTURE_PLAN.md`](NFC_REARCHITECTURE_PLAN.md)), write their TagBack URL, track claim lifecycle, blacklist compromised/lost tags.

**Planned** (see [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md) for the full spec — self-serve NFC Setup, Messages hub, Notifications hub, sidebar owner nav, scan/tap log, real moderation, admin analytics, tag grouping, data export/deletion, theme toggle, and more). Nothing in that plan is implemented yet beyond the design-system pass logged in [`REDESIGN_CHANGES.md`](REDESIGN_CHANGES.md).

## Run

```bash
npm install
cp .env.example .env   # fill in Firebase keys (optional for preview)
npm run dev
```

Without Firebase keys the app runs in **placeholder mode**: auth is stubbed and
public/finder pages render mock data, so every screen is previewable.

## Routes

Public: `/`, `/login`, `/register`, `/nfc/:tagId`, `/chat/:chatId`
Owner (protected): `/dashboard`, `/dashboard/items`, `/dashboard/items/claim`, `/dashboard/nfc-setup`, `/dashboard/messages`, `/dashboard/notifications`, `/dashboard/settings`
Admin: `/admin/inventory`, `/admin/moderation`

## Design system

Brand: **TagBack** — purple (`#a855f7`) → pink (`#ec4899`) gradient accent on a
pale lavender (`#e9edf5`) canvas, soft neumorphic (extruded/pressed) surfaces
plus near-opaque white glass cards, pill-shaped buttons/badges. Full spec in
[`LIGHT_NEUMORPHIC_REDESIGN_PLAN.md`](LIGHT_NEUMORPHIC_REDESIGN_PLAN.md)
(supersedes the original dark theme in [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md#2-design-system-derived-from-the-tagback-landing-screenshot)).

## Data model &amp; privacy

PII isolation is enforced at document granularity (Firestore can't filter fields
on read), so public-safe data and owner-linking data live in separate collections:

| Collection | Visibility | Fields |
|---|---|---|
| `users/{uid}` | private (owner) | email, displayName, phone, notificationPrefs |
| `tags/{tagId}` | public read, **admin write** | `tagId` is the TagBack ID minted at registration (not the physical chip UID); `physicalUid` (optional, only if the registering device's browser exposed one), status (`registered`/`claimed`/`blacklisted`), `chipType`, `writeStatus` (`not_written`/`writing`/`written`/`write_failed`), `flagReason` (optional string, set by admin when blacklisting) |
| `items/{tagId}` | **public read** | tagId, itemName, isLostMode, lostMessage, rewardAmount — **no PII, no ownerUid** |
| `tagProfiles/{tagId}` | **public read**, owner write | website/instagram/facebook/tiktok/linkedin/youtube, contactEnabled, lostFoundEnabled — **no PII, no ownerUid** |
| `itemOwners/{tagId}` | private (owner) | ownerUid — the tag→owner map |
| `reports/{id}` | owner read | tagId, finderSessionToken, initialMessage, location, status |
| `chats/{id}` + `messages` | party read | anonymous two-way thread |

A finder reading `items/{tagId}` can never resolve the owner. See
[`firestore.rules`](firestore.rules).

### Admin access

`tags/{tagId}` writes require a Firebase Auth custom claim (`admin: true`) —
there is no in-app way to grant it, by design. One-time setup per admin:

1. In the Firebase console, go to Project settings -> Service accounts ->
   Generate new private key. Save the JSON file somewhere outside the repo
   (it must never be committed).
2. Point `GOOGLE_APPLICATION_CREDENTIALS` at that file and run the grant
   script:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
     node scripts/setAdmin.js you@example.com
   ```
   (a UID also works in place of the email).
3. The affected user must sign out and back in (or otherwise refresh their
   ID token) for the new claim to take effect — `AdminLayout` checks
   `(await user.getIdTokenResult()).claims.admin` on every load and redirects
   non-admins to `/login`.

TagBack IDs are `TB-XXXX-XXXX`, drawn from an unambiguous 31-character
alphabet (no `0`/`O`, `1`/`I`/`L`) — short enough to read off a sticker and
type by hand, still ~40 bits of entropy against enumeration. Minted by
TagBack at registration, never by the physical chip. See
[`NFC_REARCHITECTURE_PLAN.md`](NFC_REARCHITECTURE_PLAN.md) for the full
identity model (physical UID vs. TagBack ID vs. NDEF URL).

## Build status by sprint

- **Done:** design system, routing, security rules, geolocation helper, finder session tokens.
- **Done:** admin auth (Firebase custom claim `admin: true`, `scripts/setAdmin.js`, `AdminLayout` guard) and real `tags/{tagId}` persistence (admin-gated writes in `firestore.rules`).
- **Done:** real Firestore reads/writes for claim (`ClaimTag.jsx` transaction), the owner items/dashboard live queries, finder reports + anonymous chat.
- **Done:** hardware-identity NFC registration (`admin/nfc-register`) — admin taps a physical sticker, reads its UID when the browser exposes one, mints a TagBack ID, writes the TagBack URL; owner claims by TagBack ID and configures `tagProfiles/{tagId}` at `dashboard/nfc-setup`. See [`NFC_REARCHITECTURE_PLAN.md`](NFC_REARCHITECTURE_PLAN.md).
- **Done:** TagBack rebrand + design-system pass (color tokens, pill buttons/badges, gradient accents) — see [`REDESIGN_CHANGES.md`](REDESIGN_CHANGES.md).
- **Done:** navigation shell — owner/admin left sidebars, public `TopNav`, and `NFC Setup`/`Messages`/`Notifications` pages — see [`REDESIGN_CHANGES.md`](REDESIGN_CHANGES.md#3--global-navigation-pattern).
- **Done:** Dashboard/Items/Messages/Notifications/Chat all read and write live Firestore via `lib/ownerItems.js` (the earlier `localStorage` mock layer, `lib/api.js`, has been removed); claiming a tag now also flips `tags/{tagId}.status` to `claimed`. See [`ARCHITECTURE.md`](ARCHITECTURE.md#4-one-data-layer-live-or-mocked-by-firebaseready).
- **TODO:** verify `NDEFReadingEvent.serialNumber` support on real target hardware (Android + Chrome + the actual NTAG stock), real moderation depth, admin analytics, and the other net-new functions in [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md). See [`ARCHITECTURE.md`](ARCHITECTURE.md#8-known-gaps--inconsistencies) and [`NFC_REARCHITECTURE_PLAN.md`](NFC_REARCHITECTURE_PLAN.md#12-known-limitations--requires-physical-hardware-to-verify) for the current gap list.
