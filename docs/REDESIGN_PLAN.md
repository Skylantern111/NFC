# TagBack — Full Redesign & Feature Plan

> Planning document only. No code changed as part of this file.
> Visual references now supplied: (1) public landing/hero page, (2) owner sidebar + Notifications empty state, (3) owner sidebar + Messages empty state, (4) owner sidebar + NFC Setup page. A 5th image (a generic "Crypto App" wallet mockup) is **not** a TagBack page — it's used below only to cross-confirm the shared visual language (glass cards, pill buttons, purple-pink gradients, glow orbs, segmented time-range toggle, icon-left/amount-right list rows), not as a page to replicate. Pages without a direct screenshot still extrapolate the confirmed tokens — flagged per-page.

---

## 1. System Functions — Introduction

TagBack is an NFC-tag-based lost & found platform. A physical NFC tag is stuck on a valuable item. If the item is lost, whoever finds it taps the tag with their phone, opens a public web page (no app install), and can message the owner and share a location — all without either party ever seeing the other's name, phone, email, or address. Identity stays separated at the database level, not just hidden in the UI.

**Core functions (existing, carried forward):**
- Owner account (email/password via Firebase Auth).
- Claim an NFC tag to an item (name, category) via NFC tap or manual tag-ID entry.
- Arm / disarm "Lost Mode" on an item, with a message to the finder and an optional reward.
- Public tap page: anyone who taps an unclaimed-safe tag sees item status and can file a "found it" report with a message and optional GPS location.
- Anonymous two-way chat between owner and finder, keyed by a private session token (finder) / Firebase Auth (owner) — never by contact info.
- Mark an item "Recovered" from chat, closing the report and clearing Lost Mode.
- Admin: batch-provision NFC tag inventory, track claim lifecycle, blacklist compromised/lost tags.

**Functions confirmed by the new mockups (promoted from speculative to designed):**
- **Self-serve NFC Setup**: an owner generates their own NFC tag ID + tap URL from their dashboard, writes it to a blank NFC sticker themselves (any NTAG213+), tests the URL, then claims it — a second provisioning path that runs *alongside* admin bulk-provisioning, not a replacement for it.
- **Messages hub**: a dedicated page listing every conversation the owner has (previously only a single "hero" chat link existed on Dashboard, with no way to see past/other chats).
- **Notifications hub**: a dedicated full page (not just a bell dropdown) showing report/message alerts.
- **Sidebar-based owner navigation** replaces the current top nav bar entirely for the dashboard app shell.

**Functions this plan adds beyond the mockups (see §5 for full detail):**
- Real notifications (in-app + email) when a report comes in or a chat message arrives.
- Per-item activity/scan log (tap history, claim history, resolution history).
- Real, backed content-moderation (block a finder token / hide a chat) replacing the current mock table.
- Admin analytics (recovery rate, time-to-recovery, inventory health).
- Tag grouping ("tag sets" — e.g. a luggage set or keyring) under one owner view.
- Lightweight identity-verification step before an owner reveals a pickup location (anti-fraud).
- Data export / account deletion (owner-initiated, privacy compliance).
- Light/dark theme toggle.
- Stale lost-mode nudge (re-engagement reminder after N days still lost).
- **"Simulate Tap"** dev/demo utility (from the NFC Setup mockup): previews the finder-side tap experience for a self-serve tag without needing physical NFC hardware on hand yet.

---

## 2. Design System (derived from the TagBack landing screenshot)

### 2.1 Brand
- **Name:** TagBack (rename from "Reclaim" across UI copy, `README.md`, page titles — logic/data model untouched).
- **Logo:** rounded-square gradient tile (purple → pink), white tag/heart glyph inside, paired with bold wordmark "TagBack".
- **Tagline pattern:** short two-line hero statement, second line in gradient color — e.g. "Tap a tag. / Bring it back."

### 2.2 Color tokens
| Token | Approx. value | Use |
|---|---|---|
| `--bg-base` | `#0d0a1a` → `#151030` diagonal/radial gradient | page background (replaces current indigo-only ambient) |
| `--accent-purple` | `#a855f7` | primary gradient start, links, focus rings |
| `--accent-pink` | `#ec4899` | primary gradient end, gradient text end |
| `--text-primary` | `#f8fafc` (white) | headlines |
| `--text-muted` | `#94a3b8` (slate-400) | body copy |
| `--surface-glass` | `rgba(255,255,255,0.05)` + `border rgba(255,255,255,0.1)` + `backdrop-blur` | cards, panels — **reuse existing `GlassCard`/`ui/card` pattern as-is**, only recolor accents |
| status red / emerald / amber | unchanged from current app | keep Lost/Safe/Reward semantics consistent app-wide |

Primary gradient: `bg-gradient-to-r from-purple-500 to-pink-500` for buttons and gradient headline text (`bg-clip-text text-transparent`).

### 2.3 Typography
- Display/H1: extrabold, tight tracking, 2-line hero pattern where relevant (marketing/empty-state pages only — not dashboards).
- Section headers: bold, `text-xl`/`text-2xl`, plain white.
- Body: `text-slate-400`, relaxed leading.
- Mono (tag IDs, coordinates): unchanged, `font-mono text-xs`.

### 2.4 Components (style guide — extends `src/components/ui/*`, no new library)
- **Button — primary:** full pill (`rounded-full`), gradient fill, white bold text, optional trailing arrow icon. Replaces current solid-indigo squared buttons for primary CTAs.
- **Button — secondary:** pill, translucent dark fill, thin white/10 border, white text. Replaces current `variant="outline"`.
- **Button — ghost/link:** text-only, slate-300 → white on hover (already matches `Login` nav link style).
- **Badge/chip:** pill, translucent bg, thin border, small leading icon — used for status/category pills (`NFC-powered Lost & Found` style) — reuse for "Reported lost", "Unclaimed", etc., replacing the current sharper-cornered `Badge`.
- **Card:** keep existing glass treatment (`rounded-2xl/3xl`, `border-white/10`, `bg-white/5`, `backdrop-blur-xl`) — already matches the aesthetic, no change needed structurally.
- **Top nav bar** (public/finder-facing pages only — see §3): transparent/blurred bar, logo+wordmark left, right-aligned text links + one solid pill CTA.
- **Sidebar nav** (confirmed by mockup, owner app shell — see §3): fixed-width (~190px) full-height panel, sits over the same ambient background (darker translucent overlay, thin right border, the colorful ambient glow only bleeds through near the bottom edge).
- **List row pattern** (cross-confirmed by the crypto-app reference): icon-in-rounded-square or 2-line label on the left, value/amount + status on the right, full-width tappable row inside a card — applies to Messages list, Notifications list, Items list.
- **Icons:** keep `lucide-react` (already a dependency).

### 2.5 Layout conventions
- Public/marketing + finder pages (Landing, Login, Register, NfcLanding, Chat): centered single column, top nav bar, generous vertical rhythm.
- Owner app pages (everything under `/dashboard`): **left sidebar shell**, no top nav bar — main content area gets just a page title + subtitle (bold white H1, gray subtitle line) with no header chrome above it.
- Admin app pages: same sidebar shell pattern for consistency (no admin-specific mockup was supplied — this is an inferred extension, flagged in §7).
- Ambient background: keep `AmbientBackground` component, retint its glow blobs to purple/pink instead of indigo/violet-only; sidebar mode lets it peek through only at the bottom-left corner rather than filling the whole panel.

---

## 3. Global Navigation Pattern (revised — sidebar confirmed by mockup)

### 3.1 Public/finder top nav (`TopNav`, unauthenticated & finder-facing surfaces)
Used on: Landing, Login, Register, NfcLanding, Chat.
- Logo + wordmark left, "Login" link + "Get Started" pill button right (Landing).
- Simpler variant elsewhere: logo left, `BackButton` (already added previous pass), no account links needed since finder never has an account.

### 3.2 Owner sidebar (`DashboardSidebar`, replaces `DashboardLayout`'s current top `<header>`)
Confirmed layout, top to bottom:
1. **Brand lockup**: gradient logo tile + two-line text block — "TagBack" bold, "NFC Lost & Found" small gray subtitle beneath.
2. **Nav items** (icon + label, vertical list, active item gets a rounded translucent highlight, inactive plain gray→white on hover):
   - Dashboard (grid icon)
   - NFC Setup (wifi/nfc icon)
   - Messages (chat-bubble icon)
   - Notifications (bell icon)
3. *(open question, §7: no separate "My Items" or "Settings" nav item appears — see reconciliation below)*
4. **Footer** (pinned bottom, above a divider line): signed-in user's email (small gray text) + "Logout" (icon + label).

`BackButton` still renders inside each page's own content header (title row), not in the sidebar itself, since sidebar nav already covers "go somewhere else" — back is only needed for pages reached outside the 4 primary nav items (Item Detail, Claim/Setup sub-steps, chat threads).

**Reconciling "My Items" and "Settings" against the mockup (no 5th/6th nav item shown, plenty of empty sidebar space below Notifications):**
- **Dashboard absorbs the items list.** The existing KPI-row + hero-incident content stays, with the full items list (currently `Items.jsx`) rendered below it on the same page instead of a separate nav destination. `Items.jsx`'s logic (arm/disarm dialog, live list) moves into a section of `Dashboard.jsx`; row click still deep-links to `dashboard/items/:tagId` (Item Detail), just no longer needs its own top-level nav entry.
- **Settings moves to the footer account row.** Clicking the email at the bottom of the sidebar opens Settings (`/dashboard/settings`) — a common "account area" pattern — rather than sitting in the primary nav list.
- This is a judgment call, not something visible in the screenshots; flagged in §7 in case the intent was simply that those screenshots were cropped before a 5th/6th item.

### 3.3 Admin sidebar
No admin mockup was supplied. Plan: mirror the same sidebar shell (brand lockup reading "TagBack Admin", nav items Inventory / Moderation / Analytics, same footer pattern) purely for shell consistency across the app. Flagged as an assumption in §7.

---

## 4. Per-Page Plan

### 4.1 `Landing.jsx` (public, logged-out home)
**Content (from screenshot):**
- Top nav: logo/wordmark, "Login" link, "Get Started" pill button (top-right).
- Badge pill: "NFC-powered Lost & Found".
- H1 two-line hero: "Tap a tag. / Bring it back." (gradient 2nd line).
- Subtext: one/two sentence value prop (no app, PII hidden).
- Two CTAs: primary gradient pill "Create your account →", secondary pill "I already have one".
**Functions:**
- Existing: links to `/register`, `/login`.
- New: keep the existing quieter "Admin console →" link, move to nav or footer (not a primary CTA — don't put it in the hero per the screenshot's clean 2-button layout).
- New: add a compact "How it works" 3-step strip below the hero (Tap → Report → Reunite) — pure content, no new data.
- New: footer with privacy-model one-liner + link to a `/privacy` explainer (reuses existing README PII copy — new lightweight page or modal, no backend).

### 4.2 `Login.jsx` / `Register.jsx`
**Content:** same form structure as today, restyled: pill inputs/buttons, gradient primary submit button, `BackButton` (already added) styled to new nav.
**Functions:** unchanged (Firebase Auth email/password, password reset). No new logic needed here.

### 4.3 `public/NfcLanding.jsx` (the actual tap destination)
**Content:** keep current structure (status card, message-from-owner, GPS + note form) restyled with new badge/button tokens; hero-style status badge instead of squared `Badge`.
**Functions (existing kept):** public item read, `reports`+`chats` creation, GPS capture.
**New functions:**
- **Scan log write** (see §5.2): on load, best-effort `addDoc` to `tags/{tagId}/scans` with `{timestamp: serverTimestamp(), roughLocation?: {lat,lng} rounded to ~1km}` — anonymous, no PII, purely a tap counter/heatmap for the owner. Only fires once per page load, never blocks the UI.

### 4.4 `public/Chat.jsx`
**Content:** keep current layout (header, location card, message thread, quick replies, input) restyled to new tokens; "Mark as recovered" stays a solid button but pill-shaped.
**Functions (existing kept):** all current chat logic unchanged.
**New functions:**
- **Notifications trigger:** on `addDoc` to `messages`, also touch a lightweight `chats/{chatId}.lastMessageAt` + `unreadFor` marker so `Dashboard`/nav can show a real unread badge (no polling hack).
- **Block finder token (owner-only):** a small "Report / Block" affordance in the chat header that writes `chats/{chatId}.blocked = true` (rules-gated to `ownsTag`) — this is what makes `admin/Moderation.jsx` real instead of mock (§4.11).

### 4.5 `dashboard/Dashboard.jsx` (owner overview — now also the items list, §3.2)
**Content:** keep current KPI row + hero "active incident" card + privacy blurb, restyle (pill badges, gradient accents for KPI numbers). **New:** below that, absorb the current `Items.jsx` list (item rows with Lost/Safe switch) directly onto this page — this is the app's actual home screen under the sidebar's "Dashboard" item, so it needs to be a genuinely complete overview, not just KPIs.
**Functions (existing kept):** live stats, hero report, chat link, live item list, arm/disarm dialog logic (moved in from `Items.jsx`, unchanged).
**New functions:**
- Item rows link into **Item Detail** (§4.7) instead of only exposing the toggle inline.
- **"Stale lost item" nudge card:** if an item has been in Lost Mode > 14 days with no open report, show a small dismissible reminder card ("Still missing — update your listing or add a reward?").
- **"+ Add a tag" CTA** (primary gradient pill) now routes to **NFC Setup** (§4.6) as the front door, rather than straight to the claim form.

### 4.6 `dashboard/NfcSetup.jsx` (**NEW page**, confirmed by mockup — replaces `ClaimTag.jsx` as the owner's primary "add a tag" entry point)
**Purpose:** self-serve tag provisioning — an owner without a pre-provisioned admin tag can generate their own ID, physically write it to a blank NTAG sticker, test it, then claim it. Confirmed 1:1 from the screenshot.
**Content (top to bottom, per mockup):**
- Page title "NFC Setup" + subtitle "Generate a unique NFC ID, write its URL to a sticker, and test it."
- **Generate card:** icon + "Generate a new NFC tag" / "Creates a unique ID and a ready-to-write URL" (left), primary gradient pill "+ Generate NFC ID" (right). On click, produces a result row: the generated ID in bold mono, the full tap URL (`tagUrl(tagId)`) in small gray mono beneath, with "Copy URL" and "Test" small outline pill buttons on the right ("Test" opens the tap URL — `/nfc/:tagId` — in a new tab so the owner can see exactly what a finder will see).
- **"How to write & test" 2×2 step grid:** Step 1 Buy a blank NFC sticker / Step 2 Copy the generated URL / Step 3 Write the URL to the NFC (via a third-party NFC-writer app) / Step 4 Tap to test. Pure static instructional content, icon + label + description per card.
- **"Ready to claim?" banner** (green-tinted, bottom): "After writing & testing, log in and tap the NFC to connect it to your account, then add your item." + green **"Simulate Tap"** button.
**Functions:**
- **Generate NFC ID:** *client-side only* — generates a short random ID (same shape as `lib/tags.js`'s existing generator) and its `tagUrl()`. Does **not** write to Firestore yet — no `tags/{tagId}` doc exists until the owner actually claims it. This avoids creating orphaned "generated but never used" inventory rows and keeps the existing admin-only `tags` create rule intact for the *pre-provisioned* inventory model.
- **Copy URL:** `navigator.clipboard.writeText`.
- **Test:** `window.open(tagUrl(tagId), '_blank')` — previews the real `NfcLanding` "tag not recognized" state (honest, since it isn't claimed yet) or, once claimed, the real item state.
- **Simulate Tap:** dev/demo convenience — navigates straight to `/nfc/:tagId` in the current tab, standing in for an actual physical tap when no NFC hardware is on hand. Same destination as "Test", different framing/placement (post-instructions CTA vs. inline preview).
- **Claim flow (self-serve branch):** clicking through from "Ready to claim?" (once actually signed in) hands off into a claim transaction that, unlike the admin-provisioned path, creates **all three** docs atomically: `tags/{tagId}` (status `'claimed'` directly — self-serve tags never pass through a public `'unclaimed'` inventory state), `itemOwners/{tagId}`, `items/{tagId}`. Requires a new rules branch (§6, §7.2) since `tags` writes are currently admin-only.
- The existing NFC-tap-to-scan-a-physical-tag convenience (`NDEFReader` scan) and manual tag-ID entry from the old `ClaimTag.jsx` still exist as the actual claim form, reached from this page's final step — effectively `ClaimTag.jsx` becomes the last step of this flow rather than a standalone nav destination.

### 4.7 `dashboard/ItemDetail.jsx` (**NEW page**, reached from a Dashboard item row, not from the sidebar)
**Purpose:** the single place an owner manages one item in depth — currently missing; today `Items.jsx` is list-only with no drill-down.
**Content:**
- Item header (name, tag id, Lost/Safe badge, edit name inline).
- Lost Mode controls (reuses the arm/disarm dialog logic factored out of the merged Dashboard list, §4.5, into a shared hook/component so both call the same logic).
- **Scan activity** section: recent entries from `tags/{tagId}/scans` (§5.2) — "Tapped 3 times in the last 7 days" + relative-time list, no PII.
- **Report/claim history** timeline: past `reports` for this tag (resolved + open) with links into their chats.
- Danger zone: unclaim/release tag (writes a real "release" flow — deletes `itemOwners/{tagId}` + resets `items/{tagId}`; for admin-provisioned tags, `tags/{tagId}.status` resets to `unclaimed` via a Cloud Function or manual admin action; for self-serve tags (§4.6) it can just delete the `tags` doc outright, since only the releasing owner ever had it — flagged as an open question in §7, since the client can't flip `tags.status` under current rules).
**Functions:** as above; all new reads/writes are owner-scoped (`ownsTag`) except the scan log which is public-write/owner-read (see §6 rules impact).

### 4.8 `dashboard/Messages.jsx` (**NEW page**, confirmed by mockup — sidebar nav item)
**Purpose:** currently there is no list of an owner's conversations at all — `Dashboard.jsx` surfaces only the single most-recent open-report chat as a "hero" card, with no way to reach older or resolved chats. This closes that gap.
**Content:**
- Page title "Messages" + subtitle "Conversations with people who found your items."
- Empty state (confirmed by mockup): centered glass card, chat-bubble icon, "No conversations yet." + "When someone reports finding your item, the chat will appear here."
- Populated state (extrapolated, no mockup): list-row pattern (§2.4) — one row per chat the owner is party to: item name + snippet of the last message (left), relative timestamp + unread dot + resolved/open status badge (right). Row click → `/chat/:chatId`.
**Functions:**
- Live query: `chats` where the owner is a party — since `chats` docs don't currently store `ownerUid` directly (only `tagId`), this needs either (a) a join against the owner's `itemOwners`-derived `tagIds` (same pattern as `useOwnerOpenReports`, `where('tagId','in', tagIds)`), or (b) adding a denormalized `ownerUid` field to `chats` at creation time for a simpler direct query. Recommend (b): cheap, additive, avoids the 30-item `in` ceiling for owners with many tags.
- Sort by `lastMessageAt` (new field, §5.1) descending.
- Reuses the unread-badge data introduced for notifications (§5.1) rather than inventing a second unread system.

### 4.9 `dashboard/Notifications.jsx` (**NEW page**, confirmed by mockup — sidebar nav item, promoted from the previous plan's "bell dropdown" concept)
**Purpose:** a real, page-level notification center rather than a transient dropdown — matches the confirmed mockup exactly.
**Content:**
- Page title "Notifications" + subtitle "You're all caught up" (dynamic — reflects zero-unread state; non-empty state needs its own subtitle copy, e.g. "You have N new alerts").
- Empty state (confirmed by mockup): centered glass card, bell icon, "No notifications yet." + "You'll be alerted here when someone finds your item or sends a message."
- Populated state (extrapolated): list-row pattern, one row per event — new report filed / new chat message / item marked recovered — with icon-per-type, relative timestamp, and a link into the relevant chat or item.
**Functions:**
- Backed by a real `notifications/{uid}/items/{id}` subcollection (or a single `notifications` collection filtered by `ownerUid` — either works; subcollection keeps rules simplest: `allow read, write: if isSignedIn() && request.auth.uid == uid` at the parent). Written by the same client actions that currently fire `addDoc` on `reports`/`messages` (a finder filing a report, sending a message) — client-side write of a notification doc alongside the existing write, no Cloud Function required for the in-app version (email notifications remain a stretch item needing Cloud Functions, §5.1).
- Mark-as-read on view; sidebar nav item shows an unread-count badge sourced from the same collection.

### 4.10 `dashboard/ClaimTag.jsx` (retained as the final step of NFC Setup, §4.6 — no longer a standalone nav destination)
**Content:** keep current form + NFC scan button, restyle to pill inputs/buttons.
**Functions (existing kept):** transaction-based claim flow — unchanged for the admin-provisioned path (tag already exists in `tags`, status `unclaimed`).
**New functions:**
- **Self-serve branch:** when reached from NFC Setup with a client-generated (not-yet-persisted) tag ID, the transaction additionally creates the `tags/{tagId}` doc itself (status `'claimed'` directly) — see §4.6, §6, §7.2.
- Resolve the earlier open item from the last session: **persist `category`** — add `category` to the `items` Firestore rules whitelist (`publicItemFieldsOnly()`) so the field the UI already collects actually saves. (Flagged decision, see §7.)

### 4.11 `dashboard/Settings.jsx` (reached via the sidebar footer account row, §3.2 — not a primary nav item)
**Content:** keep contact + notification-prefs cards, restyle. Currently a static stub (`TODO(sprint 2)`).
**New functions (makes this page real for the first time):**
- Bind fields to `users/{uid}` with real `getDoc`/`updateDoc` (phone, notification prefs) — closes the existing TODO.
- **Theme toggle** (light/dark) — new `users/{uid}.themePref`, applied via a root `data-theme` attribute + Tailwind `dark:` variants.
- **Data export** button: client-side gathers the user's own `users`, `items`, `reports`, `chats` docs (all owner-readable already) into a downloadable JSON — no new backend, pure client aggregation.
- **Delete account** button: deletes owned `items`/`itemOwners` docs + Firebase Auth account, with a confirm dialog (destructive — matches existing `Dialog` confirm pattern used in `Items.jsx`/`Chat.jsx`).

### 4.12 `admin/AdminLayout.jsx` + `admin/Inventory.jsx`
**Content:** keep current gate logic + batch-provisioning form + lifecycle table, restyle table/badges to new tokens (admin keeps its solid-surface non-blurred panels for table perf, per the existing code comment — don't force glassmorphism here).
**New functions:**
- **CSV import:** admin can bulk-upload pre-existing tag IDs (for physically pre-printed stock) instead of only auto-generating IDs.

### 4.13 `admin/Moderation.jsx`
**Content:** replace the current hardcoded `flagged` array with a real live query.
**New functions:**
- Live query: `chats` where `blocked == true` (written from §4.4's owner-side block action), joined with `items` for the item name.
- "Ban token" becomes real: writes a `blockedTokens/{finderSessionToken}` doc; `firestore.rules` for `reports`/`chats`/`messages` create-rules gain a check against this collection so a blocked finder token can no longer file new reports or send messages.
- "Unban" action for admin to reverse a block.

### 4.14 `admin/Analytics.jsx` (**NEW page**, new nav link)
**Purpose:** currently zero visibility into program health beyond raw inventory counts.
**Content:**
- Recovery rate (resolved reports / total reports, real `getCountFromServer` aggregates).
- Median time-to-recovery (created → resolved timestamp delta, computed client-side over a recent sample — no new backend needed, or a scheduled Cloud Function rollup if volume grows).
- Inventory health (unclaimed/claimed/blacklisted breakdown — already computed in Inventory, surfaced here as a chart instead of duplicated logic).
**Functions:** read-only aggregation queries, admin-gated like the rest of `/admin`.

---

## 5. New System-Wide Features — Detail

### 5.1 Notifications (in-app + email) — now a full page, §4.9
- In-app: dedicated `Notifications` page (confirmed by mockup) backed by a real `notifications` collection (per-owner, written client-side alongside the existing `reports`/`messages` writes), plus an unread-count badge on the sidebar's Notifications nav item. No new infra — just a new collection + `onSnapshot` reads already covered by the existing owner-scoped rules shape.
- Email (stretch, needs a Cloud Function — flagged as a separate build phase): Firestore-triggered function on `reports` create / `messages` create sends a transactional email to the owner via an email provider (e.g. Resend/SendGrid). Requires Cloud Functions deploy, currently out of scope of the pure-frontend build — call out explicitly as a backend-infra addition, not a page rebuild.

### 5.2 Scan/tap activity log
- New subcollection `tags/{tagId}/scans/{scanId}`: `{ timestamp, roughLocation? }`. Public-create (any tap can write one, no auth), owner-read only.
- Rules: `allow create: if request.resource.data.keys().hasOnly(['timestamp','roughLocation']);` `allow read: if ownsTag(tagId); allow update, delete: if false;`.
- Purpose: gives the owner real signal ("has anyone even tapped this tag?") without tracking finder identity.

### 5.3 Tag grouping ("sets")
- New collection `itemSets/{setId}`: `{ ownerUid, name, tagIds: [] }`. Optional convenience layer over existing `items` — lets an owner label "Luggage set" and see 3 tags as one card on Dashboard. Purely additive, no change to existing per-tag rules.

### 5.4 Blocked finder tokens (see §4.13) — anti-abuse, real backing for Moderation.

### 5.5 Identity-verification-lite before pickup location reveal
- Optional per-item `verificationQuestion`/`verificationAnswerHash` set by the owner (Settings-style form on Item Detail). Before Chat shows the owner's shared meeting location to a finder, finder answers the question; simple client-side hash compare against a value never exposed in a public-readable doc (stored alongside `itemOwners`, which is already owner-private-read — needs a narrow rule allowing write-only verification via a Cloud Function or a dedicated compare-only rule; flagged as needing careful rules design, not a naive client compare of a public field).

### 5.6 Data export / account deletion — see §4.11.

### 5.7 Light/dark theme — see §4.11. Affects Tailwind config (`darkMode: 'class'`) + a root-level provider; purely presentational, no data-model impact beyond the one new `themePref` field.

### 5.8 Stale lost-mode nudge — see §4.5. Purely computed client-side from existing `items.isLostMode` + timestamps; if `items` doesn't yet store a "lost since" timestamp, add `items/{tagId}.lostSince` (set when `isLostMode` flips true) — small additive rules-whitelist change.

---

## 6. Data Model Additions Summary

| Location | New field/collection | Written by | Read by |
|---|---|---|---|
| `items/{tagId}.category` | field | owner (claim/edit) | public |
| `items/{tagId}.lostSince` | field | owner (arm lost mode) | public |
| `tags/{tagId}/scans/{id}` | subcollection | anyone (public tap) | owner only |
| `tags/{tagId}` — **self-serve create branch** | rule change | owner, atomically with `itemOwners`+`items` at claim time (status `'claimed'` directly, no `'unclaimed'` inventory state) | public read (unchanged) |
| `chats/{chatId}.ownerUid`, `.lastMessageAt`, `.unreadFor`, `.blocked` | fields | set at chat creation (`ownerUid`, from the report's tag), owner/finder (message send), owner (block) | owner/finder per existing chat rules |
| `notifications/{ownerUid}/items/{id}` | collection | client, alongside existing `reports`/`messages` writes | owner only (`request.auth.uid == ownerUid`) |
| `blockedTokens/{token}` | collection | admin only | rules-checked on `reports`/`messages` create |
| `itemSets/{setId}` | collection | owner | owner only |
| `users/{uid}.themePref` | field | owner (self) | owner (self) |
| item verification fields | fields (design TBD, §5.5) | owner | narrow, needs dedicated rule |

All additions are additive to the existing whitelist-based rules model established previously — no existing field/collection is removed or renamed.

---

## 7. Open Questions (need a decision before implementation)

1. **`category` persistence** — carried over from the previous build: add to the `items` whitelist now as part of this redesign?
2. **Tag "release/unclaim" flow** (§4.7 danger zone) — client can't currently flip `tags.status` back to `unclaimed`; needs either a Cloud Function or an admin-manual step. Which?
3. **Self-serve tag creation** (§4.6, §6) — confirm the proposed model: NFC Setup generates an ID client-side only, and the `tags` doc is created atomically at claim time (status `'claimed'` directly), coexisting with admin bulk pre-provisioning (status starts `'unclaimed'`). Alternative: let "Generate NFC ID" write an `'unclaimed'` `tags` doc immediately (simpler transaction later, but allows orphaned never-claimed rows and needs a broader create rule for signed-in users, not just admins).
4. **Dashboard/Items merge + Settings-via-footer** (§3.2) — confirmed reading of the sidebar mockup (4 nav items only, no separate Items/Settings entries), or were those simply cropped out of the screenshots and should stay as their own nav items?
5. **Email notifications (§5.1)** — requires standing up Cloud Functions + an email provider account. In scope for this redesign pass, or a later phase?
6. **Verification-lite (§5.5)** — worth the added rules complexity, or defer?
7. **Rebrand scope** — rename only visible copy/logo ("Reclaim" → "TagBack"), or also rename the repo/package (`nfc-lost-and-found` → something TagBack-flavored) and any Firebase project display name?
8. **Admin sidebar** (§3.3) — no admin mockup was supplied; confirm mirroring the owner sidebar shell is the right call, or if admin should keep its current top-nav layout (it's already a deliberately different, non-blurred "ops console" surface per the existing code comments).

---

## 8. Suggested Build Phasing (sequencing only, not started)

1. **Design system + shell pass** — new tokens/buttons/badges, `TopNav` (public/finder) + `DashboardSidebar` (owner), applied to every existing page, rebrand copy. No new data/logic.
2. **Dashboard/Items merge + Item Detail page + scan log + `category`/`lostSince` fields** — closes existing gaps, adds real drill-down.
3. **NFC Setup page + self-serve claim branch** — second provisioning path, biggest net-new flow.
4. **Messages page + Notifications page** — the two other confirmed net-new sidebar destinations; introduces `chats.ownerUid`/`lastMessageAt` and the `notifications` collection.
5. **Moderation real-data + blocked tokens** — makes admin console fully real (last remaining mock).
6. **Stale-lost nudge** — engagement layer, no new infra, reuses §4 timestamps.
7. **Settings real binding + theme toggle + data export/delete** — closes the last stub page.
8. **Admin Analytics + CSV import** — admin/ops depth.
9. **Stretch:** email notifications (Cloud Functions), tag sets, verification-lite.
