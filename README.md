# TagBack — NFC Lost &amp; Found

Physical-to-digital lost property recovery. Owners stick an NFC tag on a
belonging; if it's lost, whoever finds it taps the tag with their phone,
lands on a privacy-shielded web page (no app install), and can message the
owner and share a location — all without either party ever seeing the
other's name, phone, email, or address. Identity stays separated at the
database level, not just hidden in the UI.

Stack: React + Vite, Tailwind 3 (light neumorphism + glassmorphism), Radix
UI primitives, Firebase (Firestore + Auth + Hosting), React Router 6,
Leaflet + OpenStreetMap (report location map), nanoid.

Live: https://nfc-lost-and-found.web.app

For how the pieces fit together (routing, data layer, Firestore schema,
security rules, NFC write flow) see [`ARCHITECTURE.md`](ARCHITECTURE.md).
Plans, audits and change logs are in [`docs/`](docs/README.md).

## System functions

**Owner**
- Account (email/password via Firebase Auth) at `/register`.
- Claim a registered tag to an item (name, category) by NFC tap or by typing
  its TagBack ID. A hardware-ID mismatch with the registered sticker shows a
  warning.
- Arm / disarm Lost Mode with a message and an optional reward.
- My NFC Profile: choose what a tap shows — Lost & Found page, a profile card
  (display name, bio, social links, contact link, "Save contact"), or a
  redirect — and edit it any time; the sticker is never rewritten.
- Anonymous two-way chat with the finder; mark the item recovered (closes the
  report); report an abusive finder.
- Dashboard, Messages and Notifications (in-app; unread count in the sidebar
  and browser tab). Release a tag, which also clears its reports, chats and
  alerts.
- Settings → **Delete my account**: removes the account, items, tag pages and
  every report, chat and alert on their tags. What is stored is listed at
  `/privacy`.

**Finder** (no account)
- Tap page at `/nfc/:tagId`: item status, the owner's links, a found-item
  report with a message and optional GPS location, then a chat. Can report
  an abusive owner. Owner-set redirects show a "You're leaving TagBack"
  page first.

**Admin** (`/admin`, separate sign-up at `/admin/register`)
- NFC Register: tap a sticker to register it (hardware UID when the browser
  exposes one, a TagBack ID either way) and write its TagBack link.
- Inventory: lifecycle table, search, CSV export, per-row ⋯ menu (edit
  content, copy URL, retry write, re-register, blacklist).
- Tag Content: edit what any tag shows, one tag or many at once; tap counts
  per mode.
- Moderation: reported chats (either direction), finder token bans.
- Owners: look up a tag's owner, disable an account, set the admin signup
  passcode.
- Errors: crashes reported from people's browsers (`lib/errorLog.js`).

## Run

```bash
npm install
cp .env.example .env   # fill in Firebase keys (optional for preview)
npm run dev
```

Without Firebase keys the app runs in **placeholder mode**: auth is stubbed
and pages render mock data, so every screen is previewable.

## Tests

```bash
npm test
```

Starts a local Firestore emulator (`firebase emulators:exec --only firestore
"vitest run"`) — never touches the real project. Needs Java and the Firebase
CLI.

- `tests/firestore.rules.test.js` — individual rules: claim, release,
  registration, field bounds, tag content, chat reports, admin signup, and
  the audit fixes.
- `tests/flows.test.js` — replays the app's real Firestore calls in order as
  a normal owner, an anonymous finder and a passcode admin (sign-up →
  register → claim → report → chat → moderation → recovery → release →
  blacklist → error log → account deletion). Added after two bugs that
  blocked every real owner slipped past the single-rule tests.

**Browser drivers** (`drivers/`, see [`drivers/README.md`](drivers/README.md)):
`npm run drivers:user` and `npm run drivers:admin` click through the owner
console and the admin console separately in Chrome — preview mode by default
(mock data, nothing real touched), live mode with test accounts.

**CI** (`.github/workflows/ci.yml`) runs the build and both test files on
every push and pull request.

## Deploy

See **[`DEPLOY.md`](DEPLOY.md)**: deploy only from `main` with CI green,
then run the smoke test; it also has the rollback commands. In short:

```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Deploy rules, indexes and hosting together — the app and the rules change
in step. Hosting sends `no-cache` for pages (so a deploy shows up
immediately), long-lived caching for `/assets/*`, and security headers; the
Content-Security-Policy is currently **report-only** (see
`firebase.json`).

## Routes

Public: `/`, `/login`, `/register`, `/nfc/:tagId`, `/chat/:chatId`, `/privacy`
Owner (signed in): `/dashboard`, `/dashboard/items`, `/dashboard/items/claim`, `/dashboard/nfc-setup`, `/dashboard/messages`, `/dashboard/notifications`, `/dashboard/settings`
Admin: `/admin/login`, `/admin/register`, `/admin/inventory`, `/admin/nfc-register`, `/admin/tags`, `/admin/tags/:tagId`, `/admin/moderation`, `/admin/owners`, `/admin/errors`

## Design system

Brand: **TagBack** — purple (`#a855f7`) → pink (`#ec4899`) gradient accent on a
pale lavender (`#e9edf5`) canvas, soft neumorphic (extruded/pressed) surfaces
plus near-opaque white glass cards, pill-shaped buttons/badges. Full spec in
[`docs/LIGHT_NEUMORPHIC_REDESIGN_PLAN.md`](docs/LIGHT_NEUMORPHIC_REDESIGN_PLAN.md).

## Data model &amp; privacy

PII isolation is enforced at document granularity (Firestore can't filter
fields on read), so public-safe data and owner-linking data live in separate
collections. "By ID" means a single document can be opened by anyone who
knows its ID; listing the collection is restricted.

| Collection | Access | Contents |
|---|---|---|
| `users/{uid}` | owner + admin; the owner may delete it unless disabled | email (must match the sign-in email), displayName, notificationPrefs, `isAdmin` (fixed at creation), `disabled` (admin-set) |
| `tags/{tagId}` | public **by ID**, list/write admin | TagBack ID (not the chip UID), status (`registered`/`claimed`/`blacklisted`), optional `physicalUid`, `chipType`, `writeStatus` |
| `tagAdmin/{tagId}` | admin only | who registered it, blacklist reason / who / prior status |
| `items/{tagId}` | public **by ID**, owner write | itemName, isLostMode, lostMessage, rewardAmount — **no PII, no ownerUid** |
| `tagProfiles/{tagId}` | public **by ID**, owner or admin write | what a tap shows: landingMode, displayName, bio, links, contactUrl, redirectUrl — **no PII, no ownerUid** |
| `itemOwners/{tagId}` | owner + admin | ownerUid — the only tag → owner map |
| `reports/{id}` | owner read/resolve; public create (exact fields) | finder report with optional location |
| `chats/{id}` + `messages` | open by ID; list: owner/admin | anonymous thread; per-side reports |
| `notifications/{id}` | owner | report / message / moderation alerts |
| `blockedTokens/{token}`, `meta/*` | admin only | finder bans; admin signup passcode |
| `clientErrors/{id}` | anyone creates (exact, bounded shape); admin reads | browser crash reports |

A finder reading `items/{tagId}` can never resolve the owner. See
[`firestore.rules`](firestore.rules).

### Admin access

Two ways to be an admin (both lose access if the account is disabled):

1. **Admin signup** at `/admin/register` with the admin signup passcode
   (8+ characters). An existing admin sets or turns off the passcode on
   **Admin → Settings** ("Generate" makes a random one). The passcode is
   checked by the database rules — it's stored in `meta/adminSignup`, never
   in the app bundle. Turn it off when nobody is being onboarded.
2. **Custom claim** (for the first admin, or without a passcode): download a
   service-account key (Firebase console → Project settings → Service
   accounts → Generate new private key; never commit it), then
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
     node scripts/setAdmin.js you@example.com
   ```
   The user signs out and back in to pick up the claim.

Signed-out visitors to `/admin/*` are sent to `/admin/login`.

TagBack IDs are `TB-XXXX-XXXX`, from an unambiguous 31-character alphabet
(no `0`/`O`, `1`/`I`/`L`) — short enough to type off a sticker, ~40 bits of
entropy. Tag IDs can't be listed publicly, so they can't be harvested and
claimed remotely. See
[`docs/NFC_REARCHITECTURE_PLAN.md`](docs/NFC_REARCHITECTURE_PLAN.md) for the
identity model (physical UID vs. TagBack ID vs. NDEF URL).

## Scripts (`scripts/`, Admin SDK, need `GOOGLE_APPLICATION_CREDENTIALS`)

All scripts share `scripts/_firebaseAdmin.js` (firebase-admin 14's modular
API).

| Script | Does |
|---|---|
| `setAdmin.js <uid-or-email>` | Grant the admin custom claim |
| `revokeSelfServeAdmin.js <uid-or-email>` | Set `users/{uid}.isAdmin` to false |
| `listSelfServeAdmins.js` | List passcode-created admins (read-only) |
| `setAdminSignupPasscode.js <passcode> \| --off` | Set or clear the admin signup passcode |
| `listEmailMismatches.js` | List profiles whose stored email doesn't match their sign-in email (read-only) |
| `exportFirestore.js [outDir]` | Back up every collection to local JSON (`backups/`, git-ignored) — the free-plan substitute for managed backups |
| `migrateUnclaimedTags.js` | One-off: old `status: 'unclaimed'` docs → current schema (`--dry-run` first) |

## Known limitations

- Finder identity is a browser-local token: bans are easy to bypass, and
  anyone holding a chat link can act as its finder. Notification spam is
  possible. Both need Firebase App Check. One token is reused across a
  finder's chats — kept on purpose, because admin bans are keyed on it.
- Finders can't delete their own reports (the owner's release or account
  deletion removes them).
- No push or email notifications, and link previews are the same for every
  tag — both need server-side code (Cloud Functions, i.e. the paid Blaze
  plan).
- NFC read/write needs Android + Chrome (Web NFC).
- See [`ARCHITECTURE.md`](ARCHITECTURE.md#8-known-gaps--inconsistencies) and
  the audits in [`docs/`](docs/README.md).
