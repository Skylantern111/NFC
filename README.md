# TagBack — NFC Lost &amp; Found

Physical-to-digital lost property recovery. Owners stick an NFC tag on a
belonging; if it's lost, whoever finds it taps the tag with their phone,
lands on a privacy-shielded web page (no app install), and can message the
owner and share a location — all without either party ever seeing the
other's name, phone, email, or address. Identity stays separated at the
database level, not just hidden in the UI.

Stack: React + Vite, Tailwind (dark glassmorphism), Firebase (Firestore + Auth),
React Router, Leaflet, Recharts, nanoid.

## System functions

**Core (implemented):**
- Owner account (email/password via Firebase Auth).
- Claim an NFC tag to an item (name, category) via NFC tap or manual tag-ID entry.
- Arm / disarm "Lost Mode" on an item, with a message to the finder and an optional reward.
- Public tap page: anyone who taps a tag sees item status and can file a "found it" report with a message and optional GPS location.
- Anonymous two-way chat between owner and finder, keyed by a private session token (finder) / Firebase Auth (owner) — never by contact info.
- Mark an item "Recovered" from chat, closing the report and clearing Lost Mode.
- Admin: batch-provision NFC tag inventory, track claim lifecycle, blacklist compromised/lost tags.

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
Owner (protected): `/dashboard`, `/dashboard/items`, `/dashboard/items/claim`, `/dashboard/settings`
Admin: `/admin/inventory`, `/admin/moderation`

## Design system

Brand: **TagBack** — purple (`#a855f7`) → pink (`#ec4899`) gradient accent on a
near-black (`#0d0a1a`) ambient background, pill-shaped buttons/badges, frosted
glass cards. Full token/component spec in [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md#2-design-system-derived-from-the-tagback-landing-screenshot).

## Data model &amp; privacy

PII isolation is enforced at document granularity (Firestore can't filter fields
on read), so public-safe data and owner-linking data live in separate collections:

| Collection | Visibility | Fields |
|---|---|---|
| `users/{uid}` | private (owner) | email, displayName, phone, notificationPrefs |
| `tags/{tagId}` | public read, **admin write** | batchNumber, status (`unclaimed`/`claimed`/`blacklisted`), `chipType` (optional, `'NTAG213'\|'NTAG215'\|'NTAG216'`, set at batch-generation time), `flagReason` (optional string, set by admin when blacklisting) |
| `items/{tagId}` | **public read** | tagId, itemName, isLostMode, lostMessage, rewardAmount — **no PII, no ownerUid** |
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

Tag ids are 21-char nanoid (~126 bits) — non-sequential, non-guessable.

## Build status by sprint

- **Done:** design system, routing, security rules, tag generator + CSV export, geolocation helper, finder session tokens.
- **Done:** admin auth (Firebase custom claim `admin: true`, `scripts/setAdmin.js`, `AdminLayout` guard) and real `tags/{tagId}` persistence (admin-gated writes in `firestore.rules`).
- **Done:** real Firestore reads/writes for claim (`ClaimTag.jsx` transaction), the owner items/dashboard live queries, finder reports + anonymous chat, and admin batch provisioning/lifecycle.
- **Done:** TagBack rebrand + design-system pass (color tokens, pill buttons/badges, gradient accents) — see [`REDESIGN_CHANGES.md`](REDESIGN_CHANGES.md).
- **Done:** navigation shell — owner/admin left sidebars, public `TopNav`, and stub `NFC Setup`/`Messages`/`Notifications` pages (static content + client-side-only tag ID generation, no self-serve claim yet) — see [`REDESIGN_CHANGES.md`](REDESIGN_CHANGES.md#3--global-navigation-pattern).
- **TODO:** the rest of [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md) — Dashboard/Items merge, self-serve claim transaction, live Messages/Notifications data, real moderation, admin analytics, and the other net-new functions it describes.
