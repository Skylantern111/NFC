# TagBack Redesign — Implementation Log

Tracks what's actually been built from [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md).
This entry covers **§1 (System Functions Introduction)** and **§2 (Design
System)** only. Nothing from §3 onward (sidebar nav restructure, NFC Setup,
Messages, Notifications, or any other new page/feature) has been touched —
all routes, data flows, and page structure are unchanged.

## §1 — System functions

No code changes (§1 is documentation only). It's now surfaced in
[`README.md`](README.md) under "System functions" so the current vs. planned
function set is visible without opening the full plan.

## §2 — Design system

### Brand
- Renamed "Reclaim" → "TagBack" everywhere it appeared in UI copy and
  comments: `index.html` title, `DashboardLayout.jsx` header, `AdminLayout.jsx`
  header, `firestore.rules` file header comment, `README.md`.
- Added a small gradient logo mark (rounded-square, purple→pink, `lucide`
  `Tag` glyph) next to the wordmark in `DashboardLayout` and `AdminLayout`.
- Left `.env.example`'s example URL, `.claude/launch.json`'s task name, and
  `finderSession.js`'s localStorage key name (`reclaim_finder_token`) alone —
  these are internal identifiers, not visible copy, and renaming the storage
  key would silently invalidate any finder session already in a browser's
  localStorage. Not part of the visible-copy rebrand §2.1 asked for.

### Color tokens
- `tailwind.config.js`: `void` background token `#0B0514` → `#0D0A1A`
  (matches the plan's `--bg-base` token).
- `src/index.css`: `body` background color updated to match.
- `AmbientBackground.jsx`: base layer changed from a flat `bg-void` fill to a
  `from-[#151030] via-[#0d0a1a] to-[#0b0514]` diagonal gradient; the second
  and third drifting glow orbs were retinted from indigo/blue and
  fuchsia/violet to a purple/pink family (`from-fuchsia-600 to-purple-500`,
  `from-pink-600 to-purple-500`) so all three orbs read as one consistent
  brand gradient instead of a broader rainbow.
- Swept every remaining `indigo-*` utility class used as a brand accent
  (buttons, links, focus rings, active nav/tab states) to the purple/pink
  family across `Landing.jsx`, `Login.jsx`, `Register.jsx`, `Chat.jsx`,
  `NfcLanding.jsx`, `Settings.jsx`, `admin/Inventory.jsx`, `admin/AdminLayout.jsx`.
  Status-semantic colors (red = lost, emerald = safe/claimed, amber = reward)
  were left untouched, per the plan.

### Components
- `src/components/ui.jsx` (`Button`): primary variant is now a pill
  (`rounded-full`) with a `from-purple-500 to-pink-500` gradient fill,
  replacing the squared solid-indigo button. `ghost` (secondary) stays
  translucent-dark but is now pill-shaped too. `Field`'s focus ring changed
  from indigo to purple.
- `src/components/ui/button.jsx` (shadcn `cva` variants): `default` is now
  the same purple→pink gradient pill; `secondary`/`outline` are now
  translucent-dark pills (`bg-white/10` / `bg-white/5`, `border-white/15`)
  instead of the light-mode-oriented shadcn defaults; `link` recolored to
  purple/pink. `destructive` unchanged in color, just made pill-shaped for
  consistency. `ghost` left as-is (still used for icon-only buttons where a
  pill shape doesn't apply).
- `src/components/ui/badge.jsx`: base shape changed from `rounded-md` to
  `rounded-full` (chip/pill), matching the plan's "pill, translucent bg, thin
  border" badge spec. Status color variants (`destructive`/`secondary`/`outline`)
  unchanged.
- `Landing.jsx`: added the confirmed hero pattern — a pill badge
  ("NFC-powered Lost & Found") above the headline, and the headline itself
  split into two lines with the second line rendered as gradient text
  (`bg-clip-text text-transparent`), matching the reference screenshot.

### Explicitly not done (out of scope for this pass)
- No new pages (NFC Setup, Messages, Notifications, Item Detail, Analytics).
- No sidebar navigation shell (`DashboardSidebar`) — `DashboardLayout` and
  `AdminLayout` keep their existing top-nav-bar structure; only their colors
  and wordmark changed.
- No new Firestore fields/collections, no rules changes beyond the one
  comment rename.
- `Card`/`GlassCard` untouched — the plan calls for keeping the existing
  glass treatment as-is, and it already matched.

## Verification
- `npm run build` — clean, 1706 modules, no new errors (only the pre-existing
  >500kB chunk-size advisory).
- No routes, data queries, or writes were touched — this is a visual-only pass.

---

# §3 — Global Navigation Pattern

New components: `src/components/nav/TopNav.jsx`, `DashboardSidebar.jsx`,
`AdminSidebar.jsx`.

### Public/finder `TopNav` (§3.1)
- Applied to `Landing.jsx` (`variant="landing"`: logo + Login link + "Get
  Started" pill), and `Login.jsx`/`Register.jsx`/`NfcLanding.jsx` (default
  variant: logo left, `BackButton` right — replaces each page's standalone
  `BackButton` row). All four pages were restructured from a single centered
  `<main>` into `<div className="flex min-h-screen flex-col"><TopNav /><main
  className="flex-1 ...">` so the nav bar and the centered content coexist.
- `Chat.jsx` was **not** switched to `TopNav` — its existing header already
  carries page-specific state (role label, recovered badge, mark-recovered
  action) that a generic nav bar can't express, and rebuilding that as a
  `TopNav` variant would be new scope beyond "apply the nav pattern." Left
  as-is, deviation from the plan's page list.

### Owner `DashboardSidebar` (§3.2)
- `DashboardLayout.jsx` now renders `<DashboardSidebar />` (fixed, 224px,
  glass) instead of the old top `<header>` with inline nav links; content
  area is offset with `ml-56`.
- **Deviation from the plan's 4-item list:** the plan's sidebar spec is
  Dashboard / NFC Setup / Messages / Notifications, with "My Items" folded
  into Dashboard. That merge is §4.5, not implemented — `Items.jsx` is still
  its own real page with live arm/disarm logic, so removing its nav entry
  would make it unreachable. Kept **My Items** as a 5th sidebar item until
  §4.5 actually merges it into Dashboard.
- Footer (per spec): owner's email — links to `/dashboard/settings` — plus a
  Logout button, both below a divider.
- `BackButton` was deliberately left in place on pages reached outside the
  primary nav (`ClaimTag.jsx`), per the plan's own reasoning in §3.2.

### Admin `AdminSidebar` (§3.3)
- `AdminLayout.jsx` swapped its top `<header>`+nav for `<AdminSidebar />`,
  solid `bg-panel` (no backdrop-blur, matching the existing perf comment
  about large tables). Nav items: Inventory, Moderation.
- **Deviation:** the plan's mirrored shell also lists "Analytics" — that page
  (§4.14) doesn't exist yet, so it's left off the nav rather than linking to
  a 404. Add it when §4.14 ships.
- Added a footer email + Logout row (admin previously had no visible logout
  at all — a small functional improvement consistent with the owner sidebar,
  not called out explicitly in the plan but implied by "same footer pattern").

### New stub pages (required to make the sidebar's nav items real routes)
- `dashboard/Messages.jsx`, `dashboard/Notifications.jsx`: static empty
  states, copied verbatim from the plan's mockup-confirmed content (§4.8,
  §4.9). Zero Firestore reads — the live conversation/notification lists are
  real logic deferred to when those sections are implemented.
- `dashboard/NfcSetup.jsx`: full static content from §4.6 (generate card,
  2×2 how-to grid, green "ready to claim" banner) **plus** the part of §4.6
  explicitly scoped as safe-to-build-now: client-side-only ID generation
  (`lib/tags.js#generateTagId`/`tagUrl`, no Firestore write), Copy URL,
  Test (opens `/nfc/:tagId` in a new tab), and Simulate Tap (navigates to it
  in the current tab). The self-serve **claim** transaction (§4.6/§7 open
  question #3 — a new rules branch letting a signed-in owner create the
  `tags` doc atomically at claim time) is **not** implemented; a footnote on
  the page says so explicitly and links to the existing admin-provisioned
  `ClaimTag.jsx` flow instead, so nothing on the page silently pretends to
  work when it doesn't.
- Routes added in `App.jsx`: `/dashboard/nfc-setup`, `/dashboard/messages`,
  `/dashboard/notifications`.

### Explicitly not done
- No mobile/responsive collapse for the sidebar (drawer, hamburger) — not
  specified in the plan; sidebar is always-visible at `w-56`.
- No new Firestore fields/collections/rules — this is a routing + shell pass.

## Verification (§3)
- `npm run build` — clean, 1712 modules, same pre-existing chunk-size
  advisory only.
- Not verified in a live browser in this session (no browser/screenshot tool
  available here) — verified by build success + structural code review of
  every edited file. Recommend a manual `npm run dev` pass before treating
  this as done, especially the two restructured `NfcLanding.jsx` return
  branches and the sidebar at narrow viewport widths.

---

# §4.8 / §4.9 — Messages page + Notifications page (build phase 4)

Turns the two stub pages from §3 into real, Firestore-backed features:
live conversation list, live notification feed, unread badges, and the
finder-side write paths that feed them (report filed, finder sends a
message).

### Deviation from §6/§8's `chats.ownerUid` design — and why

The plan's data-model table (§6) and §4.8 both call for a denormalized
`chats.ownerUid` field, written by the finder at chat-creation time, so
Messages.jsx can query "my chats" directly. Implementing that literally
turned out to be impossible under the plan's own privacy model: the finder
would need to read `itemOwners/{tagId}` to learn the owner's uid before they
can write it — but `itemOwners` is explicitly `firestore.rules`' one
strictly-private collection ("Never public"), so a finder has no legal way
to obtain that value client-side. The existing `chats` create rule
required `ownerUid` anyway (`hasAll([...,'ownerUid'])`) with no code path
ever supplying it — real report submissions would have been **rejected by
the rules as they stood**, a live bug (not something this pass introduced).

Fix: dropped `chats.ownerUid` and `notifications/{ownerUid}/items/{id}`
entirely. Both now use the **same tagId-keyed join** `reports` already
uses — the owner resolves their own `tagIds` from `itemOwners` (which they
*can* read, via `ownsTag`), then queries `chats`/`notifications` with
`where('tagId', 'in', tagIds)`. No rule needs to trust a client-supplied
owner id; `itemOwners` stays exactly as private as the header comment says.
`firestore.rules` updated accordingly (chats create no longer requires
`ownerUid`; `notifications` is now a top-level `tagId`-keyed collection,
shaped like `reports`, instead of a per-owner subcollection).

### New fields (`chats`)
- `lastMessageAt`, `lastMessageText` (≤140 chars) — stamped by
  `lib/ownerItems.js#touchChatActivity` whenever either side sends a
  message, and seeded at chat creation in `NfcLanding.jsx` from the
  finder's initial report note (so a conversation shows up in Messages.jsx
  immediately, before any reply).
- `unreadFor: string[]` — `'owner'` and/or `'finder'`, driven by
  `touchChatActivity` (adds the *other* role on send) and
  `markChatRead` (removes the viewer's own role, called from `Chat.jsx` on
  mount for whichever role opened it, and from a Messages.jsx row click).
- Rules: finder-side chat `update` now allows
  `['lastMessageAt','lastMessageText','unreadFor']` (was missing
  `lastMessageText`).

### New collection (`notifications`)
- `{ type: 'report'|'message', tagId, chatId, reportId, read, createdAt }`,
  top-level, tagId-keyed (see deviation above).
- Written by `lib/ownerItems.js#notifyOwner`, called from
  `NfcLanding.jsx` (`type: 'report'`, on every new report+chat) and
  `Chat.jsx` (`type: 'message'`, only when the **finder** sends — an owner
  is never notified about their own outgoing message). "Item marked
  recovered" (listed as a third type in §4.9's populated-state description)
  was intentionally not implemented as a notification: that's the owner's
  own action on their own item, so notifying them about it has no purpose.
- Both writer call sites are fire-and-forget (`.catch(() => {})`) — a failed
  notification write must never block the report/message the user is
  actually trying to send, same convention as the existing scan-log write
  in `NfcLanding.jsx`.

### `dashboard/Messages.jsx`
Real list (`lib/ownerItems.js#useOwnerChats` joined with
`useOwnerItems` for the item name and `useOwnerOpenReports` for the
open/resolved badge — reuses the existing hook rather than a second
Firestore read per row). Row = item name + last-message snippet, relative
time, unread dot, Open/Resolved badge. Click marks the chat read for
`'owner'` and navigates to `/chat/:chatId`. Empty state unchanged from §3.

### `dashboard/Notifications.jsx`
Real list (`useOwnerNotifications`), icon per type, relative time, unread
dot. Subtitle is now dynamic: "You have N new alerts." vs "You're all
caught up." (was hardcoded to the latter). Click marks the notification
read and navigates to its chat (or `/dashboard/messages` if it has none).

### `components/nav/DashboardSidebar.jsx`
Notifications nav item now shows an unread-count pill (gradient badge,
"9+" past 9), sourced from `useOwnerNotifications(user).unreadCount` — the
one sidebar badge the plan actually asks for (§4.9); Messages has no
sidebar badge, only per-row unread dots inside the page itself.

### `lib/ownerItems.js` — new exports
`useOwnerTagIds` (extracted from `useOwnerItems`, now shared by every hook
that needs the owner's tagIds), `useOwnerChats`, `useOwnerNotifications`,
`notifyOwner`, `touchChatActivity`, `markChatRead`, `markNotificationRead`,
plus mock fixtures (`ownerChatsMock`, `ownerNotificationsMock`) so both
pages preview real content with no Firebase project configured.

### Explicitly not done
- No email notifications (§5.1 stretch) — still needs Cloud Functions,
  out of scope here as the plan itself flagged.
- No "marked recovered" notification type — see above, judged pointless
  (self-notification).
- The report's `initialMessage` still isn't posted into
  `chats/{id}/messages` — it only seeds `lastMessageText` for the list
  preview. `Chat.jsx`'s thread view starts empty until someone sends a
  message through the chat UI. Pre-existing gap, not introduced or
  widened by this pass, but worth flagging since it means a finder's very
  first message is visible in Messages.jsx's snippet but not in the thread
  itself.

## Verification (§4.8/§4.9)
- `npm run build` — clean, 1712 modules, same pre-existing chunk-size
  advisory only.
- Live-verified with `npm run dev` + browser automation (mock/no-Firebase
  mode, since `ProtectedRoute` renders dashboards without auth when
  `firebaseReady` is false): `/dashboard/messages` shows the mock
  conversation row (item name, snippet, unread dot, Open badge);
  `/dashboard/notifications` shows the mock alert with a dynamic "You have
  1 new alert." subtitle; sidebar Notifications item shows a "1" badge on
  both pages and on `/dashboard`. No console errors on any of the three
  routes. Real Firestore reads/writes (the `in`-join queries, the rules
  changes) are unverified against an actual Firebase project — there's no
  `.env` with real credentials in this environment — so they're verified
  by rules logic + code review only, not a live write.

---

# §4.13/§5.4 — Moderation real data + blocked tokens (build phase 5)

Closes the last mock in the admin console. New pieces: an owner-side
"Report / Block" affordance in `public/Chat.jsx` (§4.4), a live moderation
queue in `admin/Moderation.jsx` (§4.13) backed by real `chats`/`items`
reads, and a working ban/unban action against `blockedTokens` (§5.4).

### `public/Chat.jsx` — owner "Report" button
- Header now shows a **Report** button next to Mark-as-recovered for the
  owner role (finder never sees it). Opens a dialog asking for an optional
  reason, then writes `chats/{chatId}.blocked = true`, `.blockedReason`,
  `.blockedAt: serverTimestamp()`. Once blocked, the button is replaced
  with a static "Reported" badge (same pattern as the existing
  Open/Recovered toggle).
- **No `firestore.rules` change was needed for this.** The existing
  `chats` update rule already lets the tag's owner (`ownsTag`) write *any*
  field with no whitelist — that unrestricted branch exists for exactly
  this kind of owner-side moderation action, it just had nothing using it
  yet. Only the *finder's* update path is field-restricted.
- `Chat.jsx#confirmRecovered` and `dashboard/Items.jsx` (disarm/re-arm)
  also now clear/set `items/{tagId}.lostSince` — see the §5.8 section
  below; bundled here since both touch the same arm/disarm code paths.

### `admin/Moderation.jsx` — real queue
- Replaced the hardcoded `flagged` array with `lib/moderation.js#useModerationQueue`:
  live `chats` where `blocked == true`, joined against `items`
  (`where('tagId','in',...)`, same join shape used everywhere else in this
  codebase) for the display name, plus a live read of the whole
  `blockedTokens` collection to know which rows are currently banned.
- **The queue is a review log, not a to-do list** — a row doesn't disappear
  once banned/unbanned, since the report itself already happened and stays
  useful history. Restyled from a raw `<table>` to the shadcn `Table`
  primitives already used by `admin/Inventory.jsx`, for consistency with
  the one other real admin page.
- **Ban token**: `lib/moderation.js#banToken` does
  `setDoc(blockedTokens/{finderSessionToken}, {bannedAt, tagId, reason})`.
  **Unban**: `unbanToken` deletes that doc. Both are genuinely admin-only —
  `firestore.rules`'s existing `blockedTokens` rule (`allow read, write: if isAdmin()`)
  already covered this, no rules change needed. `isBlockedToken()` (already
  wired into `reports`/`chats`/`messages` create rules from an earlier
  session) is what makes a ban actually take effect: a banned token can no
  longer file a report, open a chat, or send a message anywhere in the app.
- Mock/preview mode: `useModerationQueue` returns two static flagged
  fixtures and a `toggleMockBan` local-state setter standing in for the two
  real write functions, so the Ban/Unban toggle is interactive without a
  Firebase project.

### Explicitly not done
- No "Dismiss without banning" action to clear `chats.blocked` — kept
  scope to exactly what §4.13/§5.4 describe (ban/unban). A row just stays
  in the queue either way.
- Not verified live against a real Firebase project (no `.env` here) — the
  `chats`/`items`/`blockedTokens` queries are plain single-field-`where`/`in`
  reads already proven by the existing Messages/Notifications/Inventory
  code, so this is a lower-risk gap than usual, but still unverified.

## Verification (§4.13/§5.4)
- `npm run build` — clean, 1713 modules, same pre-existing chunk-size
  advisory only.
- Live-verified with `npm run dev` + browser automation (mock mode):
  `/admin/moderation` renders both mock flagged rows with item name, reason
  badge, finder token, relative time, and an Active/Banned status pill;
  clicking **Ban token** flipped the row to Banned and swapped the button
  to **Unban** with no console errors. The owner-only Report button in
  `Chat.jsx` could **not** be visually exercised the same way: in mock mode
  `useAuth().user` is always `null` (no real Firebase Auth), so `Chat.jsx`'s
  `role` is always `'finder'` and the owner-only header controls (this new
  Report button, and the pre-existing Mark-as-recovered button from an
  earlier session) never render — same pre-existing limitation noted for
  Mark-as-recovered, not something new. Verified by code review instead.

---

# §4.5/§5.8 — Stale lost-mode nudge (build phase 6)

### `items/{tagId}.lostSince`
- Already whitelisted in `firestore.rules`' `publicItemFieldsOnly()` from
  an earlier session (speculatively added, never actually written) — so
  **no rules change was needed** for this phase either.
- Now actually written: `dashboard/Items.jsx#confirmArm` sets it to
  `serverTimestamp()` when Lost Mode is armed; `onToggle`'s disarm path and
  `Chat.jsx#confirmRecovered` both clear it back to `null` when Lost Mode
  turns off (arming again later gets a fresh timestamp).

### `dashboard/Dashboard.jsx` — nudge card
- For each owned item where `isLostMode` is true, `lostSince` is more than
  14 days old, and there's no *open* report against it (an active incident
  already has its own hero card — a stale nudge would be redundant), render
  a small dismissible amber card: "Still missing — '{item}'. Lost N days
  ago. Update your listing or add a reward?" with an **Update listing**
  link and a dismiss (×) button.
- **"Update listing" links to `/dashboard/items`**, not a per-item detail
  page — Item Detail (§4.7) hasn't been built yet, so this is the honest
  destination that actually exists today. Revisit once §4.7 ships.
- Dismissal persists per-tag in `localStorage` (`staleNudgeDismissed`),
  keyed by `` `${tagId}:${lostSince.toMillis()}` `` so a later re-arm (new
  `lostSince`) surfaces the nudge again instead of staying permanently
  dismissed.
- **Bug caught during live verification, not by the build**: the mock
  fixture (`lib/ownerItems.js#ownerItemsMock`) originally shaped
  `lostSince` as `{ toMillis: () => Date.now() - N }` — a live clock read
  on every call, unlike a real Firestore `Timestamp` which returns the same
  value every time. That made the dismiss key drift by however many
  milliseconds elapsed between renders, so a dismissed card's key never
  matched itself on the next render and the × button silently did nothing.
  Fixed by snapshotting the offset once per `ownerItemsMock()` call
  (`const sixteenDaysAgo = Date.now() - ...`) so repeated `toMillis()`
  calls return an identical value, matching real Timestamp semantics. This
  was purely a mock-fixture bug — real Firestore `Timestamp` objects were
  never affected — but it would have made the dismiss button appear broken
  in any Firebase-less preview/demo.
- Mock data: `mock-tag-2` ("Car Keys") changed from `isLostMode: false` to
  `isLostMode: true` with `lostSince` 16 days back and no matching report,
  specifically so the nudge has something to render in preview mode
  alongside `mock-tag-1`'s existing active-incident hero card.

### Explicitly not done
- No server-side/scheduled check — purely computed client-side from
  already-loaded `items`/`reports`, per §5.8's own scope note.
- Only one nudge card per stale item, no cap/collapse if an owner somehow
  has many simultaneously-stale items — not a realistic volume for this
  app's scale, not worth the complexity.

## Verification (§4.5/§5.8)
- `npm run build` — clean.
- Live-verified with `npm run dev` + browser automation (mock mode): the
  nudge card rendered on `/dashboard` for "Car Keys" ("Lost 16 days ago.
  Update your listing or add a reward?"), the × dismissed it with the
  change persisting across a full page reload, and `localStorage` showed
  the expected `mock-tag-2:<fixed-ms>` key (confirmed via direct JS
  execution in the page, not just visually). No console errors. Not
  verified against a real Firebase project (no `.env` here) — the write
  paths (`serverTimestamp()`/`null` on an already-whitelisted field) are a
  small enough change to be low-risk, but genuinely untested against live
  Firestore.
