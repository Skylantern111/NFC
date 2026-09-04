# Improvement Plan — Existing Features Only

Scope: UX/UI, visual design, and functional/logic improvements for features that already exist in the app. No new features are proposed here.

**Status:** Rounds 1–4 are all implemented.

---

## Round 1 — done

| # | Item | Resolution |
|---|------|------------|
| 1 | NFC Setup ↔ Claim Tag mismatch | Chose option (a): rewrote NfcSetup's copy to "Preview the finder page" and stopped implying self-serve claim works, instead of changing the claim transaction/rules. |
| 2 | Settings page non-functional | `Settings.jsx` reads `users/{uid}` on mount, writes via `updateDoc` on Save, uses `ui/switch.jsx` instead of a raw checkbox. |
| 3 | ClaimTag's dead `category` field | Now included in the claim transaction's `itemRef` write; already covered by `publicItemFieldsOnly()` in `firestore.rules`, so no rules change was needed. |
| 4 | Items.jsx Lost Mode off-toggle | Confirmation dialog added before disarming; `toggleLostMode()` now preserves `lostMessage`/`rewardAmount` on disarm instead of clearing them. |
| 5 | Auth error messaging | `friendlyAuthError()` in `lib/utils.js` maps Firebase codes to plain copy; Login/Register split error vs. info state so a success message no longer renders in red; password visibility toggle added; Register got a confirm-password field; Login honors `location.state.from`. |
| 6 | Unify "alert/lost" red + surface rule | Dashboard incident badges moved onto the same red-400 family as `GlassCard`/`Items`/`NfcLanding`; neumorphic-vs-glass rule and the red-family semantics documented as a comment block in `index.css`. |
| 7 | Sidebar responsiveness | New shared `components/nav/SidebarShell.jsx` (desktop fixed rail + mobile top bar/Sheet drawer); `DashboardSidebar`/`AdminSidebar` are now thin wrappers around it; layouts use `md:ml-56`. |
| 8 | Admin Inventory | Confirm dialog before batch generation; `startAfter` pagination past the 100-row cap via "Load more"; CSV export now covers the current filtered/searched view, not just the last-generated batch. |
| 9 | Moderation ban evasion | Documented as a code comment (session-token identity, not fixed — would need a stronger identity scheme, out of "no new features" scope). |
| 10 | Dashboard multi-incident support | `incidents` now maps every open report to its own card, not just `reports[0]`. |

Also picked up in the same pass (smaller bullets from the per-section notes): Items search + skeleton loading; Messages Open/Resolved filter; Notifications "mark all read" + `limit(200)` cap on the query; ClaimTag distinguishes "no tag" vs "unreadable tag"; NfcSetup adds verifiable per-step checkmarks and relabels Test/Simulate Tap; Chat gets in-thread timestamps, a scroll-to-bottom button, and a quick-reply overflow fade hint; NfcLanding's location share is re-shareable instead of one-shot; Landing's admin link demoted to a footer link.

**Bug fix found along the way (not in the original plan):** `Chat.jsx`'s `send()` cleared the draft text before awaiting `sendChatMessage`, so a rejected write (e.g. a banned finder token) silently ate the user's message. Fixed with a try/catch that restores the draft and shows a friendly `permission-denied` message; the same pattern was applied to `NfcLanding.jsx`'s `submitReport`.

**Deliberately left as documented limitations** (would need new Firestore fields/collections, a security-rules change, or browser-based visual QA — out of "no new features, minimal risk" scope):
- Stale-nudge dismissal is still localStorage-only (`Dashboard.jsx`), so it doesn't sync across an owner's devices.
- No resolved-incident history — once a report is closed, it just disappears.
- `nextBatchNumber()` (`Inventory.jsx`) still reads-then-writes without a transaction; two admins generating batches at the same moment could collide.
- Moderation bans are still keyed on `finderSessionToken`, a localStorage identity — clearing storage or switching browsers evades a ban.
- No contrast/focus-ring audit was performed (needs a browser, not available in this environment).

---

## Round 2 — done

| # | Item | Resolution |
|---|------|------------|
| 1 | Stale-nudge/incident cross-device sync | **Not implemented.** Still needs a persisted `dismissedAt`/`resolvedAt` field plus a `firestore.rules` allowance — real schema/rules work, kept as a documented limitation rather than rushed in this pass. |
| 2 | Inventory batch-number race | Fixed for real: `nextBatchNumber()` now runs inside a Firestore `runTransaction` against a new admin-only `meta/tagBatchCounter` doc (rules addition mirrors the existing admin-only `tags`/`blockedTokens` pattern), so two admins generating batches at once can no longer collide. Cold start seeds the counter from the highest existing `batchNumber`. |
| 3 | Contrast / focus-ring audit | Verified via code instead of a live browser pass: `buttonVariants` already ships `focus-visible:ring-ring/50 focus-visible:ring-[3px]` on every variant, and `Switch`/`Input`/`Textarea` carry the same focus-visible ring from shadcn's base styles — no gap found. Full manual contrast QA in Chrome is still unverifiable in this environment. |
| 4 | Notifications delete/clear | Added `clearReadNotifications()` (`lib/ownerItems.js`) and a "Clear read" button next to "Mark all as read" — deletes only already-read notifications, confirmed allowed by `firestore.rules`' existing `allow ... delete: if ownsTag(...)` on `notifications/{notifId}`. |
| 5 | Messages row icon by category | `Messages.jsx` now maps the linked item's `category` (persisted since Round 1) to a `lucide-react` icon (`Luggage`/`KeyRound`/`Wallet`/`Smartphone`/`Bike`/`PawPrint`/`Package`), falling back to the generic `MessageSquare` for pre-Round-1 items with no category. |
| 6 | Sidebar/notification listener duplication | Confirmed real: `DashboardSidebar` and `Notifications.jsx` each called `useOwnerNotifications(user)` independently. Fixed with a new `context/OwnerNotificationsContext.jsx` provider mounted once in `DashboardLayout.jsx`; both consumers now read from one shared `onSnapshot` listener via `useOwnerNotificationsContext()`. |
| 7 | Asymmetric moderation | Not fixed — reconfirmed as a scope decision, not a bug. |
| 8 | Loading skeletons on Messages/Notifications | Both now show `Skeleton` rows while loading, matching `Items.jsx`'s Round 1 treatment. |
| 9 | Inventory search + status filter combination | Verified, not a bug: `filteredRows` already ANDs `statusFilter` and `search` correctly. No change needed. |
| 10 | Raw `alert()` vs. the unused toast component | `<Toaster />` is now mounted once in `App.jsx`; all `alert()` calls in `Chat.jsx`, `NfcLanding.jsx`, `Items.jsx`, and `Moderation.jsx` were replaced with `toast.error()`/`toast.success()`. |
| 11 | Dialog focus handling | Radix `Dialog` already traps focus and restores it to the trigger on close by default, so nothing was broken — added `autoFocus` to the non-destructive **Cancel** button on confirm-only dialogs (Items disarm, Chat "Mark as recovered", Inventory "Generate batch") so keyboard users land on the safe default action first. |
| 12 | Inconsistent button loading pattern | `Login`, `Register`, and `Settings` submit/save buttons now show a `Loader2` spinner alongside the in-flight label, matching the pattern already used by `NfcSetup`'s write button and `NfcLanding`'s submit button. |
| 13 | Empty states with no icon | Added a muted icon above the copy in `Items.jsx`'s "no items"/"no search match" cards and Dashboard's "No active incidents" card, matching the icon-in-tint pattern `Messages.jsx`/`Notifications.jsx` already used. |
| 14 | "No results" vs "loading" distinction | Verified, not a bug: every list already renders a distinct loading state, a distinct empty state, and (where search exists) a distinct no-match state. No change needed. |
| 15 | Neumorphic `:active` press feedback | Verified `Button`'s `default`/`destructive`/`outline`/`secondary` variants already wire `active:shadow-neu-pressed(-sm)`. Extended the same idea to the raw (non-`Button`) interactive elements that lacked it: Dashboard's dismiss-nudge `X`, Chat's scroll-to-bottom button, and Chat's quick-reply chips. |

**Deliberately left as documented limitations after Round 2** (unchanged from Round 1, still out of "no new features" scope): stale-nudge/incident state doesn't sync across devices (item 1 above), moderation bans are still session-token-scoped, and a full manual contrast/focus audit in a real browser hasn't been run.

---

## Round 3 — done

| # | Item | Resolution |
|---|------|------------|
| 1 | Auth/Settings forms on a legacy Button/Field | `Login.jsx`, `Register.jsx`, and `Settings.jsx` now import the shadcn `Button`/`Input`/`Label` used everywhere else instead of `components/ui.jsx`'s standalone versions. A fourth caller turned up during the swap: `Landing.jsx`'s two hero CTAs were also on the legacy `Button` — fixed too, so its "Owner sign in"/"Create account" buttons now match every other primary button in the app (neu-flat surface, gradient text) instead of the old solid-gradient-fill look. Password-visibility-toggle buttons were repositioned from a hardcoded `top-[2.35rem]` offset to `top-1/2 -translate-y-1/2` inside a `relative` wrapper, since the shadcn `Input`'s height differs slightly from the legacy `Field`'s. |
| 2 | Dead legacy `Badge` | `components/ui.jsx` (which only ever held the legacy `Button`/`Field`/`Badge`) is deleted outright now that item 1 emptied its last real callers — confirmed zero remaining imports before removal. |
| 3 | Items.jsx category text-only vs. Messages.jsx's icon | Both pages, plus `ClaimTag.jsx` (item 4), now share one `lib/categories.js` exporting `CATEGORIES` and `CATEGORY_ICON` — `Items.jsx`'s category badge renders the matching icon the same way `Messages.jsx` already did. |
| 4 | ClaimTag's category picker had no icon preview | `ClaimTag.jsx`'s `<Select>` now renders each `SelectItem` with its `CATEGORY_ICON`; Radix mirrors the selected item's content into the trigger automatically, so the trigger's current-value display picks up the icon for free with no extra code. |
| 5 | AdminGate "Loading…" had no spinner | Both of `AdminLayout.jsx`'s `AdminGate` loading screens now show a `Loader2` spinner next to the text, matching the spinner-plus-label pattern Round 2 established for async buttons. |

---

## Round 4 — done (deeper pass: shared component internals and CSS cascade, not just per-page copy)

Rounds 1–3 worked page-by-page. This pass instead read the shared primitives everything else is built on (`components/ui/card.jsx`, `dialog.jsx`, the `lib/*` helpers) and traced how their defaults actually cascade into every page that uses them — which is where the deepest, least-obvious bug of the four rounds turned up.

### 1. `components/ui/card.jsx`'s default `border` silently outlined almost every card in the app — fixed
**Resolution:** dropped the bare `border` utility from `card.jsx`'s base className (with a comment explaining why), in the one file that fixes every call site at once. Rebuilt clean; every glass/solid card in the app now shows only the border its own className actually specifies (i.e. none, except `GlassCard.jsx`'s deliberate `border-white/60`).
The base `Card` component (`src/components/ui/card.jsx:11`) ships `"bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm"`. That bare `border` utility renders a 1px `hsl(var(--border))` (light slate-grey) outline, and it is never cancelled: every real call site in the app only overrides background/blur/radius/shadow (e.g. Items.jsx/Messages.jsx/Notifications.jsx/ClaimTag.jsx's `glass = 'bg-white/70 backdrop-blur-xl rounded-3xl'`, Chat.jsx/NfcLanding.jsx's `GLASS` constant, Dashboard.jsx's and Inventory.jsx's inline `rounded-3xl bg-white/80 ... shadow-lg`) — none of them pass `border-none`/`border-0`, and grepping the whole `src/pages` tree confirms zero call sites do. Because `cn()` uses `tailwind-merge`, which treats bare `border` (width/style) and a color-only utility as separate groups, nothing about those overrides removes the inherited border-width utility.
Compare this to `components/GlassCard.jsx` — the *only* component that actually uses the real `.glass` utility class defined in `index.css` (`bg-white/70 backdrop-blur-xl border border-white/60 shadow-lg rounded-3xl`), which deliberately sets a **white**-tinted edge highlight as part of the glassmorphism look. Every other page's hand-rolled "glass" card is really a shadcn `Card`, and instead of that intentional white edge, it's getting an unrelated grey outline nobody asked for. The design-system comment block in `index.css` (added Round 1) documents glass vs. neumorphic vs. admin-solid as the only three deliberate surface treatments — a stray grey-bordered fourth variant isn't one of them.
**Fix at the source, one file:** drop `border` from `card.jsx`'s base className. Nothing in the codebase relies on `Card`'s default bordered look (every usage already fully re-skins it), so this is a pure bug fix, not a behavior change anyone depends on.

### 2. Glass "material" had drifted into three slightly different recipes across pages — unified
**Resolution:** `Chat.jsx` and `NfcLanding.jsx`'s `GLASS` constants moved from `backdrop-blur-2xl` to `backdrop-blur-xl`, matching the majority (and the `.glass` class itself). `Dashboard.jsx`'s stat cards, "No active incidents" card, and privacy-note card moved from a flat `bg-white/80` (no blur) to `bg-white/70 backdrop-blur-xl`, matching the rest of the owner dashboard. Dashboard's semantic accent cards (the red active-incident card, the amber stale-item nudge) were deliberately left untouched — those are intentional accent surfaces per the existing red/amber semantics, not part of the neutral-card drift.

### 3. `ProtectedRoute.jsx`'s auth-check screen had no spinner — fixed
Round 3 gave `AdminLayout.jsx`'s `AdminGate` a `Loader2` spinner but missed its sibling. **Resolution:** `ProtectedRoute.jsx` — which gates every `/dashboard/*` route — now shows the same spinner-plus-label pattern.

### 4. Relative-time formatting was implemented three separate times — consolidated
**Resolution:** removed the local `relativeTime()` functions from `Inventory.jsx` and `Moderation.jsx`; both now call the shared `relativeTimeFromMs(toMillis(x))` from `lib/utils.js`, which already normalized both a Firestore Timestamp and a plain `Date`/parseable value into milliseconds — no wrapper needed, the existing helper's dual-shape handling was already sufficient.

### 5. `ClaimTag.jsx`'s NFC scan handler was registered in the wrong order relative to `scan()` — fixed
**Resolution:** `reader.onreading`/`reader.onreadingerror` are now assigned before `await reader.scan()`, matching the Web NFC spec's own reference pattern, so a tag tapped in the gap between `scan()` starting and a handler being attached can no longer fire unheard.
