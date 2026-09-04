# TagBack — Architecture

System-level reference for how the app is put together. For product scope see
[`README.md`](README.md); for UI token/component spec see
[`REDESIGN_PLAN.md`](REDESIGN_PLAN.md) and [`LIGHT_NEUMORPHIC_REDESIGN_PLAN.md`](LIGHT_NEUMORPHIC_REDESIGN_PLAN.md).

## 1. Shape of the system

Single-page React app, no custom backend server. All persistence is direct
client → Firebase (Firestore + Auth) via the JS SDK, gated by Firestore
Security Rules — there is no API server in between.

```
Browser (React SPA, Vite build)
  ├─ react-router-dom            client-side routing
  ├─ Firebase Auth               owner + admin identity
  ├─ Firestore (direct SDK)      all persistent data, rule-gated
  └─ Web NFC (NDEFReader)        optional, writes tag URL from Chrome/Android
```

No native app. "Programming a tag" happens on a normal web page — either the
browser writes it directly (Web NFC, Chrome/Android/HTTPS) or the owner uses
a third-party NFC-writer app as a fallback, but the URL, the copy step, and
the test step are all done on this website (`dashboard/nfc-setup`).

## 2. Stack

| Layer | Choice |
|---|---|
| Build/dev | Vite 6 |
| UI | React 18, react-router-dom 6 |
| Styling | Tailwind CSS 3 + shadcn/ui (Radix primitives) + `class-variance-authority` |
| Theme | Light neumorphism + glassmorphism hybrid — see `LIGHT_NEUMORPHIC_REDESIGN_PLAN.md` |
| Data | Firebase Firestore + Firebase Auth (email/password) |
| Maps | Google Maps wrapper (`components/Map.jsx`) for finder-shared location |
| Misc | `nanoid` (tag IDs, finder session tokens), `lucide-react` (icons), `recharts` (admin charts) |

## 3. Routes

Defined in `src/App.jsx`.

| Path | Page | Guard |
|---|---|---|
| `/` | `Landing.jsx` | public |
| `/login`, `/register` | `auth/Login.jsx`, `auth/Register.jsx` | public |
| `/nfc/:tagId` | `public/NfcLanding.jsx` | public — the page an NFC tap resolves to |
| `/chat/:chatId` | `public/Chat.jsx` | public — anonymous, token-gated (see §5) |
| `/dashboard` (+ `items`, `items/claim`, `nfc-setup`, `messages`, `notifications`, `settings`) | `dashboard/*` under `DashboardLayout.jsx` | `ProtectedRoute` (signed-in owner) |
| `/admin` (+ `inventory`, `moderation`) | `admin/*` under `AdminLayout.jsx` | `ProtectedRoute` **and** `AdminGate` (custom claim `admin: true`) |

`ProtectedRoute.jsx` only checks "is a user signed in." `AdminLayout.jsx`
additionally re-checks the ID token's `admin` claim client-side
(`AdminGate`) — real enforcement for both still lives in `firestore.rules`;
the client guards are UX (redirect), not the security boundary.

## 4. One data layer, live or mocked by `firebaseReady`

Every page (`Dashboard.jsx`, `Items.jsx`, `Messages.jsx`, `Notifications.jsx`,
`Chat.jsx`, `NfcLanding.jsx`, `ClaimTag.jsx`, admin `Inventory.jsx`/
`Moderation.jsx`) now reads and writes through the same Firestore-backed
hooks in `lib/ownerItems.js` / `lib/moderation.js` — real `onSnapshot`
listeners and rule-gated writes. There used to be a second, incompatible
`localStorage` mock layer (`lib/api.js` + `lib/seedData.js`) that
`Dashboard`/`Items`/`Messages`/`Notifications` ran on instead; it's been
removed (see `MOCK_DATA_LAYER_PLAN.md` for the historical plan it followed).

`firebaseReady` (`src/firebase/config.js`) is `true` only when real Firebase
env vars are present. When `false`, the same `lib/ownerItems.js` hooks
return their own hardcoded `*Mock()` fallbacks instead of subscribing, so
every screen still renders with zero setup — one placeholder dataset, not
two.

`items/{tagId}` has no generic `status` field (see §5's field whitelist) —
"found reported" and "recovered" are **derived**, not stored:
- **found reported**: the tag has an open doc in `reports/` (`useOwnerOpenReports`).
- **recovered**: the specific chat has `resolved: true`, set by
  `markRecovered()` alongside clearing `isLostMode` — an app-level field on
  the chat doc (unrestricted by rules for the owner, like `blocked`), not a
  schema/rules change.

## 5. Firestore data model & privacy boundary

PII isolation is enforced at **document** granularity, because Firestore
can't filter individual fields on a read — public-safe fields and
owner-linking fields are kept in separate collections so a finder can never
resolve who owns a tag.

| Collection | Visibility | Notes |
|---|---|---|
| `users/{uid}` | private (owner) | profile, phone, notification prefs |
| `tags/{tagId}` | public read, admin write | provisioning status: `unclaimed` / `claimed` / `blacklisted` |
| `tags/{tagId}/scans/{scanId}` | public create, owner read | anonymous tap counter, immutable |
| `items/{tagId}` | **public read** | itemName, isLostMode, lostMessage, rewardAmount — no PII, no ownerUid |
| `itemOwners/{tagId}` | private (owner) | the only tag → owner map; never public |
| `reports/{id}` | owner read, public create | a finder's "found it" report, keyed by `finderSessionToken` |
| `chats/{id}` + `messages` | party read | anonymous two-way thread, no `ownerUid` on the doc |
| `notifications/{id}` | owner read (via tagId join) | written by whoever triggers the event |
| `blockedTokens/{token}` | admin only | finder session bans (see Moderation) |

Full rule logic: [`firestore.rules`](firestore.rules). Key mechanisms:
- `ownsTag(tagId)` — looks up `itemOwners/{tagId}.ownerUid` against
  `request.auth.uid`; this is the single source of "do you own this."
- The claim transaction (`ClaimTag.jsx`) creates `items/{tagId}` and
  `itemOwners/{tagId}` together; rules use `existsAfter()`/`getAfter()` to
  validate the sibling write mid-transaction.
- Since `itemOwners` is private, a finder can't join it to learn an owner's
  uid — chats/reports/notifications are instead joined **from the owner's
  side**, by querying `where('tagId', 'in', ownerTagIds)` (`lib/ownerItems.js`).
- Finder identity is a `finderSessionToken` (nanoid, `localStorage`,
  `lib/finderSession.js`) — never Firebase Auth, never contact info.

## 6. Auth & admin

- Owner auth: Firebase Auth email/password (`context/AuthContext.jsx` wraps
  `onAuthStateChanged`).
- Admin is a Firebase custom claim (`admin: true`), granted out-of-band via
  `scripts/setAdmin.js` (needs a service-account key) — there is no in-app
  grant flow, by design. See `README.md` for the one-time setup steps.
- Finder side has no account at all — just the session token above.

## 7. NFC tag write flow

`dashboard/nfc-setup` (`NfcSetup.jsx`):
1. Generate a tag ID client-side (`nanoid(21)`, `lib/tags.js`) — nothing is
   written to Firestore yet, so this step can't create orphaned inventory.
2. Build the tap URL (`{origin}/nfc/:tagId`).
3. Write it to a physical tag two ways:
   - **In-browser**, via the Web NFC API (`window.NDEFReader`, Chrome on
     Android + HTTPS only) — feature-detected; no separate app needed.
   - **Fallback**: any third-party NFC-writer app, for Safari/iOS/desktop
     where Web NFC doesn't exist.
4. Test by tapping the tag, or "Simulate Tap" (navigates to `/nfc/:tagId`
   in-app, standing in for a physical tap when no hardware is on hand).
5. Claiming (linking the tag to the owner's account) is a separate step —
   today it goes through `dashboard/items/claim`, not straight from setup.

## 8. Known gaps / inconsistencies

- Self-serve claim of a freshly generated tag ID isn't wired up — claiming
  still requires the tag to already exist in admin-provisioned `tags/`
  inventory (`NfcSetup.jsx` links out to `ClaimTag.jsx` instead, which
  requires a pre-provisioned `tags/{tagId}` doc).
- Tapping an unclaimed tag (`/nfc/:tagId`) shows "Tag not recognized" with
  no link into the claim flow, even for a signed-in owner — no
  `?tagId=...`-style handoff from tap to `ClaimTag.jsx` exists yet.
- `components/Map.jsx` is a Google Maps wrapper, not Leaflet, despite
  `leaflet`/`react-leaflet` being dependencies and `index.css` still
  carrying `.leaflet-container` theming.
- Item categories aren't persisted (`ClaimTag.jsx`'s category picker is
  reference-only — `items/{tagId}` has no `category` write path yet, though
  the field is whitelisted in `firestore.rules`).
