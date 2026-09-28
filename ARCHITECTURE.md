# TagBack — Architecture

System-level reference for how the app is put together and how its main
workflows run. For product scope and setup see [`README.md`](README.md);
for Firebase project setup see [`docs/FIREBASE_SETUP.md`](docs/FIREBASE_SETUP.md);
for the design system see
[`docs/LIGHT_NEUMORPHIC_REDESIGN_PLAN.md`](docs/LIGHT_NEUMORPHIC_REDESIGN_PLAN.md).
History (plans, audits) is in [`docs/`](docs/README.md).

## 1. Shape of the system

Single-page React app, no custom backend server. All persistence is direct
client → Firebase (Firestore + Auth) via the JS SDK, gated by Firestore
Security Rules. There is no API server in between, and no Cloud Functions
(the project runs on the free Spark plan).

```
Browser (React SPA, Vite build, Firebase Hosting)
  ├─ react-router-dom            client-side routing
  ├─ Firebase Auth               owner + admin identity (email/password)
  ├─ Firestore (direct SDK)      all persistent data, rule-gated
  └─ Web NFC (NDEFReader)        admin sticker registration/writing and
                                 owner tap-to-claim (Chrome on Android)
```

Consequences of "no backend":
- **`firestore.rules` is the security boundary.** Client-side guards
  (`ProtectedRoute`, `AdminGate`) are UX only.
- No push or email notifications, and no per-tag link previews (both need
  server code). Notifications are in-app only.
- Finders have no account. Their identity is a random token in
  `localStorage`.

## 2. Stack

| Layer | Choice |
|---|---|
| Build/dev | Vite 6 |
| UI | React 18, react-router-dom 6; shared page/state components in `src/components` (`PageHeader`, `StatusBadge`, `States`, `FormField`, `ConfirmDialog`, `NfcScanPanel`) — see `docs/UI_UX_IMPROVEMENT_PLAN.md` |
| Styling | Tailwind CSS 3 + 16 shadcn/ui components (Radix primitives) in `src/components/ui` |
| Theme | Light neumorphism + glassmorphism, dark mode (`docs/LIGHT_NEUMORPHIC_REDESIGN_PLAN.md`) |
| Data | Firebase Firestore + Firebase Auth (email/password) |
| Hosting | Firebase Hosting (SPA rewrite, cache + security headers in `firebase.json`) |
| Maps | Leaflet + OpenStreetMap tiles (`components/ReportLocationMap.jsx`), finder-shared location |
| Misc | `nanoid` (TagBack IDs, finder tokens), `lucide-react` (icons), `sonner` (toasts) |
| Tests | Vitest + `@firebase/rules-unit-testing` against the Firestore emulator |

## 3. Routes and guards

Defined in `src/App.jsx`. Dashboard and admin pages are lazy-loaded chunks.

| Path | Page | Guard |
|---|---|---|
| `/` | `Landing.jsx` | public |
| `/login`, `/register` | `auth/Login.jsx`, `auth/Register.jsx` (owner signup only) | public |
| `/nfc/:tagId` | `public/NfcLanding.jsx` | public — what a tap opens |
| `/chat/:chatId` | `public/Chat.jsx` | public; role decided per chat (§8.4) |
| `/privacy` | `Privacy.jsx` | public |
| `/dashboard` (+ `items`, `items/claim`, `nfc-setup`, `messages`, `notifications`, `settings`) | `dashboard/*` under `DashboardLayout.jsx` | `ProtectedRoute` (signed in) |
| `/admin/login`, `/admin/register` | `admin/AdminLogin.jsx`, `admin/AdminRegister.jsx` | public |
| `/admin` (+ `inventory`, `nfc-register`, `tags`, `tags/:tagId`, `moderation`, `owners`, `errors`) | `admin/*` under `AdminLayout.jsx` | `AdminGate` inside `AdminLayout` |

`AdminGate` sends signed-out users to `/admin/login` and lets in only
admins (`lib/adminAuth.js#checkIsAdmin`, which mirrors the rules'
`isAdmin()`).

## 4. Data layer: live, or mocked by `firebaseReady`

All pages read and write through hooks and functions in `lib/ownerItems.js`,
`lib/moderation.js`, `lib/adminOwners.js` and `lib/tagContent.js`: real
`onSnapshot` listeners and rule-gated writes.

`firebaseReady` (`src/firebase/config.js`) is `true` only when real Firebase
env vars are present. When `false`, the same hooks return hard-coded
`*Mock()` data instead of subscribing, so every screen renders with zero
setup.

Owner data is joined **from the owner's side**:
1. `useOwnerTagIds` lists `itemOwners` where `ownerUid == me`. Under
   `DashboardLayout` this is **one shared listener**
   (`OwnerTagIdsProvider`) for every owner page and the badge; outside it
   (e.g. `Chat.jsx`) the hook opens its own.
2. Items, reports, chats and notifications are fetched by those tag IDs
   (`where('tagId', 'in', …)`, chunked by 30).

Nothing public ever carries an `ownerUid`.

`items/{tagId}` has no status field. "Found reported" and "recovered" are
derived:
- **found reported:** the tag has an open `reports/` doc.
- **recovered:** the chat has `resolved: true`, and its report has
  `status: 'resolved'` (both set by `markRecovered()`).

## 5. Firestore data model and rules

PII isolation is enforced at **document** granularity (Firestore can't hide
individual fields), so public-safe data and owner-linking data live in
separate collections. **"By ID"** = anyone can open a single document if
they know its ID; **listing** the collection is restricted.

| Collection | Access | Contents |
|---|---|---|
| `users/{uid}` | owner + admin; the owner may delete it unless disabled | `email` (must equal the sign-in email), displayName, notification prefs, `isAdmin` (fixed at creation, passcode-checked), `disabled` (admin-set) |
| `tags/{tagId}` | public by ID; list + write admin; owner may flip status on claim/release | TagBack ID, `status` (`registered` / `claimed` / `blacklisted`), optional `physicalUid`, `chipType`, `writeStatus` |
| `tags/{tagId}/scans/{id}` | public create (real tag, server time); owner/admin read | tap counter + `landingMode` shown |
| `tagAdmin/{tagId}` | admin only | `registeredBy`, blacklist reason / who / prior status |
| `items/{tagId}` | public by ID; list owner/admin; owner write (field whitelist + bounds) | itemName, category, isLostMode, lostMessage, rewardAmount, lostSince |
| `tagProfiles/{tagId}` | public by ID; list admin; owner or admin write | what a tap shows: `landingMode`, `displayName`, `bio`, links, `contactUrl`, `redirectUrl`, toggles, `updatedBy`, `editorRole` |
| `itemOwners/{tagId}` | owner get + list of own rows; admin | `ownerUid` — the only tag → owner map |
| `reports/{id}` | public create (exact fields); owner read/resolve/delete | finder's report: message, optional location (rounded to ~11 m; cleared when resolved) |
| `chats/{id}` | get by ID public; list owner/admin; create by finder (exact fields) | thread metadata, `unreadFor`, `resolved`, `reportedByOwner` / `reportedByFinder`, `reviewedAt` |
| `chats/{id}/messages/{id}` | read by chat ID; create by owner or matching finder token (server time, exact fields) | `sender`, `text` |
| `notifications/{id}` | create by anyone for an existing item (exact fields, known types); owner read/update/delete | `type` (`report` / `message` / `moderation_resolved`), `chatId`, `read` |
| `blockedTokens/{token}` | admin only | finder bans |
| `meta/adminSignup` | admin only | admin signup passcode |
| `clientErrors/{id}` | anyone creates (exact fields, size-bounded, server time, own uid or none); admin read/delete | browser crash reports (`lib/errorLog.js`) |

Key rule mechanisms (`firestore.rules`):
- **`ownsTag(tagId)`**: `itemOwners/{tagId}.ownerUid == caller`, and the
  caller isn't disabled. It is the single source of "do you own this".
- **`isAdmin()`**: custom claim `admin: true`, or `users/{uid}.isAdmin`.
  Either way, never for a disabled account.
- **Optional fields are read with `.get(field, default)`**
  (`disabled`, `isAdmin`, token claims). Reading a missing field is an
  evaluation error in rules and denies the request. That once blocked
  every real owner (`docs/SYSTEM_AUDIT_ROUND2.md` A0).
- **`get` vs `list` are separate rules.** A query has no single document
  ID, so an ID-based check like `ownsTag(tagId)` can't run on it. List
  rules check `resource.data` fields that the query constrains instead
  (`docs/SYSTEM_AUDIT_ROUND3.md` A1).
- **Claim and release are transactions that must write together.** The
  rules check the sibling writes with `existsAfter()` / `getAfter()`:
  - `itemOwners` create ⇔ `tags.status` `registered → claimed`
  - `itemOwners` delete ⇔ `claimed → registered`
- **Admin-managed tags:** an unclaimed tag whose profile is `profile` or
  `redirect` can't be claimed.
- **Profile deletion is safe:** a user may delete their own
  `users/{uid}`, except while disabled. So deleting and re-creating it
  can't shed `disabled`, and a re-created profile still needs the passcode
  for `isAdmin`.
- **Email check:** `users/{uid}.email` must equal the sign-in token's
  email, on create and whenever it changes. The admin console displays
  it.

## 6. Auth and admin

- **Owners:** Firebase Auth email/password at `/register`
  (`components/SignupForm.jsx`). `AuthContext` watches the user's profile,
  force-signs-out a disabled account, and creates a missing profile once.
- **Admins, two paths:**
  1. **Admin signup** at `/admin/register` with the passcode stored in
     `meta/adminSignup`. The rules compare it on create; it is 8+
     characters, set on **Admin → Settings** ("Generate" makes a random one)
     or with `scripts/setAdminSignupPasscode.js`. A wrong passcode creates
     no account.
  2. **Custom claim** via `scripts/setAdmin.js` (service-account key). Used
     to bootstrap the first admin.
- **Disabling** (`users/{uid}.disabled`, Admin → Owners) is a soft disable:
  - every owner and admin rule refuses the account
  - an open session is signed out client-side
  - Firebase Auth sign-in itself isn't revoked (no backend)
- **Deleting an account** (Settings) is §8.9.
- **Finders** have no account: `lib/finderSession.js` token in
  `localStorage`.

## 7. NFC tags and tag content

Three identifiers, never to be confused:
- **Physical UID:** the chip's hardware serial (`NDEFReadingEvent.serialNumber`),
  when the browser exposes it. Optional metadata, never a credential.
- **TagBack ID:** `TB-XXXX-XXXX` (`lib/tags.js#generateTagbackId`), minted
  at registration. It is the `tags` doc ID, the `/nfc/:tagId` path, and
  what owners type to claim.
- **NDEF URL:** what is written on the sticker, always `{origin}/nfc/<TagBack ID>`.

**The sticker is only a pointer.** What a tap shows lives in
`tagProfiles/{tagId}` and changes without rewriting the sticker:
- `lostfound` (default): the item page and the found-item report form.
- `profile`: a digital card (name, bio, links, "Save contact" as vCard).
- `redirect`: sends the visitor to a URL.
  - **Admin-set:** instant (`editorRole: 'admin'` is rules-checked).
  - **Owner-set:** shows a "You're leaving TagBack" page and needs a click.

An item in **Lost Mode always shows the Lost & Found page**, whatever the
mode (`lib/tagContent.js#resolveLanding`).

## 8. System workflows

Each step names the code that runs it. `tests/flows.test.js` replays these
same Firestore calls against the rules.

### 8.1 Admin: register and write a sticker (`admin/NfcRegister.jsx`)
1. **Start NFC scan**, then tap a sticker. The scan stops after one tap
   (AbortController).
2. The page checks whether the sticker is already known. It looks for a
   TagBack URL already on the sticker, or a matching `physicalUid`.
   - Stickers holding other URLs are treated as new.
   - A known sticker shows its record.
3. **Register:** one transaction creates `tags/{id}` (`status: 'registered'`)
   and `tagAdmin/{id}` (`registeredBy`).
4. **Write NFC tag:** writes the TagBack URL. `writeStatus` records
   `written` or `write_failed`; Inventory's ⋯ menu has **Retry write** and
   **Re-register** (for a replacement sticker, keeping the same TagBack ID).
5. **Set tag content** (optional): `/admin/tags/:tagId`, or many tags at
   once from **Tag Content** or **Inventory → Set content**. Bulk editing
   applies to unclaimed tags only.

### 8.2 Owner: sign up and claim (`SignupForm.jsx`, `ClaimTag.jsx`)
1. **Sign up** at `/register`. This creates the Auth user and a
   `users/{uid}` profile with `isAdmin: false`.
2. **Claim** at `/dashboard/items/claim`. The owner types the TagBack ID,
   scans the sticker, or arrives from a tap on an unclaimed tag.
3. One transaction:
   1. reads the tag, its `itemOwners` and its profile
   2. refuses if the tag is blacklisted, already owned, or admin-managed
   3. creates `itemOwners/{id}` and `items/{id}`, and flips the tag to
      `claimed`
4. If the tap exposed a hardware serial that doesn't match the
   registered one, the owner gets a warning (possible swapped sticker).

### 8.3 Owner: set up the item (`Items.jsx`, `NfcSetup.jsx`)
- **Lost Mode on/off** (`toggleLostMode`), with a message to the finder and
  an optional reward.
- **NFC profile:** landing mode, links, contact link, and whether finders
  can report. The page shows a live preview and notes when an admin
  edited it last.
- **Tap count** per item. Admins also see it split by mode.

### 8.4 Finder: tap, report, chat (`NfcLanding.jsx`, `Chat.jsx`)
1. The tap opens `/nfc/:tagId`. The page reads the tag, item and profile
   **by ID**, then records a scan (skipped for editor previews,
   `?preview=1`).
2. What the page shows:
   - blacklisted tag: "no longer active"
   - unclaimed tag: a claim offer (or its admin content)
   - otherwise: Lost & Found, profile or redirect, as in §7
3. **Report found item:** creates `reports/{id}` (message, optional GPS
   location), then `chats/{id}` (`unreadFor: ['owner']`), then a `report`
   notification. The finder lands in the chat.
4. **Chat roles:** in `/chat/:chatId`, the viewer is the **owner** only if
   the chat's tag is one of their tags. A signed-in TagBack user who found
   someone else's item is the **finder** there, and admins get a read-only
   view.
5. **Finder messages** include the finder token. The first unread message
   in a burst also creates a `message` notification.

### 8.5 Owner: respond and recover (`Dashboard`, `Messages`, `Notifications`, `Chat`)
- **Dashboard** shows one card per open report, with its own chat
  (`chat.reportId`) and the reported location on a map.
- **Messages** lists the owner's chats. Previews come from the latest real
  message.
- **Notifications** are shown newest first. Each opens its own chat. The
  unread count appears in the sidebar and the browser tab title.
- **Mark as recovered** (owner, in the chat): Lost Mode goes off, the chat
  is marked `resolved: true`, and the report is set to `status: 'resolved'`.

### 8.6 Reporting and moderation (`Chat.jsx`, `admin/Moderation.jsx`, `admin/Owners.jsx`)
- Either side can report a chat. The owner's report goes in
  `reportedByOwner`, the finder's in `reportedByFinder`; `blocked: true`
  puts the chat in the admin queue.
- **Owner reported the finder:** the admin can **Ban token**, which stops
  that finder token from creating reports, chats and messages. The owner
  gets a `moderation_resolved` notification.
- **Finder reported the owner:** the admin gets **Look up owner** on the
  Owners page, where the owner can be disabled.
- **Mark reviewed** records the admin's review.

### 8.7 Owner: release a tag (`Items.jsx` → `lib/ownerItems.js#releaseTag`)
1. Checks that the tag is `claimed`. Blacklisted tags can't be released,
   and the button is hidden for them.
2. Deletes the tag's reports and notifications. Chats are deleted too,
   except reported ones, which get `archivedAt` and stay for moderation.
   This is so the next owner can't see them.
3. One transaction deletes `itemOwners`, `items` and `tagProfiles`, and
   flips the tag back to `registered` (retried up to 3 times).

### 8.8 Admin: blacklist (`admin/Inventory.jsx`)
- **Blacklist:** the tag is set to `blacklisted`. The reason, the admin and
  the prior status go to `tagAdmin`. The finder page then says the tag is
  inactive, and the rules refuse new reports, chats and messages on it.
- **Unblacklist** restores the prior status. It restores `registered`
  instead of `claimed` if the owner has since deleted their account.

### 8.9 User: delete my account (`Settings.jsx` → `lib/account.js#deleteMyAccount`)
1. Confirm (type `DELETE`) and re-enter the password. Firebase only
   deletes a recently signed-in user.
2. For every owned tag:
   - **claimed:** `releaseTag`, which clears the tag's history and returns
     it to stock.
   - **blacklisted:** clear the history, then delete the item, profile and
     ownership. The tag stays blacklisted with no owner.
3. Delete `users/{uid}`, then the Auth user.

`AuthContext`'s "missing profile" repair is paused during this
(`profileRepairPaused`), so the profile isn't re-created mid-deletion.

### 8.10 Error reporting (`lib/errorLog.js` → `admin/Errors.jsx`)
- React error boundaries and `window` error / `unhandledrejection` events
  call `reportError`.
- It writes to `clientErrors` at most 5 times per page load, one report
  per distinct message. It sends the path only (no query string) and never
  throws.
- Admins see the latest 100 grouped by message on **Admin → Settings →
  Error log**, and
  can clear them.

## 9. Hosting and deploy

`firebase.json`:
- **Caching:** SPA rewrite to `index.html`. Pages get `Cache-Control:
  no-cache`, so a deploy shows up at once; `/assets/*` (hashed build files)
  are cached for a year.
- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy` and `Permissions-Policy` (geolocation for this site
  only).
- **`X-Robots-Tag: noindex`** for `/chat`, `/dashboard` and `/admin`,
  plus `public/robots.txt` disallowing them.
- **Content-Security-Policy:** sent as **report-only** for now. It allows
  this site, Firebase APIs, Google Fonts and OpenStreetMap tiles. The theme
  script is a file (`public/theme-init.js`), not inline, so the policy can
  stay at `script-src 'self'`.
- **Link previews:** static Open Graph tags in `index.html` and
  `public/og-image.png`. Every link shares one preview; per-tag previews
  need server rendering.

Deploy: see [`DEPLOY.md`](DEPLOY.md). Only from `main` with CI green.
Rules, the notifications index (`firestore.indexes.json`) and hosting are
deployed together, followed by the smoke test and, if needed, a rollback.

## 10. Testing

`npm test` starts the Firestore emulator (CI runs it on every push and
pull request, `.github/workflows/ci.yml`) and runs:
- `tests/firestore.rules.test.js`: individual rules (claim, release,
  bounds, tag content, reports, admin signup, audit fixes).
- `tests/flows.test.js`: §8's workflows as a real owner (with a profile
  doc), an anonymous finder and a passcode admin, through to error
  reporting and account deletion. Added after two bugs that
  blocked every real owner passed the single-rule tests.

## 11. Known gaps

- **Finder identity** is a browser-local token:
  - bans are easy to bypass
  - anyone holding a chat link can act as that chat's finder
  - notifications can be spammed

  All three need Firebase App Check. A single token is kept across a
  finder's chats on purpose: admin bans are keyed on it.
- **Finders can't delete their own reports.** The owner's release or
  account deletion removes them.
- **No staging project** yet: deploys go straight to production (CI and
  the smoke test are the safeguards).
- **No push or email notifications**, and link previews are the same for
  every tag (both need Cloud Functions, i.e. the Blaze plan).
- **Web NFC** only works in Chrome on Android. iPhones can open tag links
  but can't register or scan-to-claim in the browser.
- **The CSP is report-only** until a full pass shows no violations.
- **`react-router` 6.x** has two moderate advisories; the fix is the v7
  upgrade.
- **Backups** are manual: `scripts/exportFirestore.js` (local JSON).
- **No usage alerts** on the free plan: check Firestore usage by hand
  (`DEPLOY.md`).
