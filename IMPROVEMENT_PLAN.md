# Improvement Plan — Existing Features Only

Scope: UX/UI, visual design, and functional/logic improvements for features that already exist in the app. No new features are proposed here.

---

## 1. Landing page (`src/pages/Landing.jsx`)

**UX/UI**
- CTA order favors "Owner sign in" first, but finders (no account) also land here via reprinted/shared links — consider splitting hero path by intent instead of owner-first.
- "Admin console →" link sits with near-equal visual weight to owner CTAs — should be de-emphasized (footer, not primary card).
- No visual walkthrough/screenshot of the actual product — copy-only sections lack an anchor for trust.

**Design**
- The three sections (hero, "What is TagBack", "How it works") repeat near-identical card shadow/spacing with no visual rhythm — page feels flat on scroll.
- Gradient text + gradient buttons + gradient icon badges are overused on one screen, diluting the accent's signal value.

**Logic**
- Static/presentational — no bugs. Verify `HOW_IT_WORKS` copy still matches the real claim flow; it currently implies a self-serve generate→claim path that isn't wired (see §5, §9).

---

## 2. Auth — Login / Register (`src/pages/auth/Login.jsx`, `Register.jsx`)

**UX/UI**
- No password visibility toggle.
- No client-side email/password format validation before submit — relies entirely on raw Firebase error strings.
- Register has no password-confirm field — a typo silently creates an account with an unintended password.
- `err` state is reused for both errors and success messages (e.g. "Reset link sent" renders in the same red error styling as a real error).

**Design**
- Both forms are a single generic glass card with no differentiation between "returning" and "new" states (no icon/illustration per screen).

**Logic**
- Raw `e.message` from Firebase is shown directly to users (e.g. `Firebase: Error (auth/invalid-email)`) — map common auth error codes to friendly copy.
- No loading/disabled state on "Forgot password?" — double-click risk.
- Login always navigates to `/dashboard` regardless of `location.state.from` — confirm `ProtectedRoute.jsx` passes an intended redirect target and wire it back in.

---

## 3. Dashboard home (`src/pages/dashboard/Dashboard.jsx`)

**UX/UI**
- Stats grid is a fixed `grid-cols-3` with no responsive breakpoints — will cramp on narrow viewports, unlike other pages that use `sm:` variants.
- Stale-item nudge dismissal is localStorage-only — doesn't sync across devices, and the "14 days" threshold isn't visible/configurable to the user.
- No history of resolved incidents — once recovered, an item's incident disappears entirely with no confirmation trail.

**Design**
- Reward/lost-message hero card uses red/pink badge tones that clash with the calmer purple accent used elsewhere, and differ from the "Lost" badge red used in `Items.jsx`.

**Logic**
- `heroItem` only ever surfaces `reports[0]` — if multiple items have open reports simultaneously, only one is shown/actionable on the dashboard; the rest are only reflected in the stat count.

---

## 4. My Items (`src/pages/dashboard/Items.jsx`)

**UX/UI**
- No search/filter/sort — fine at a few items, breaks down with many tags.
- Turning Lost Mode **off** has zero confirmation, while turning it **on** opens a full dialog — asymmetric friction, and the off-path silently clears the drafted message/reward with no undo.
- No loading/empty skeleton — plain text only, despite `ui/skeleton.jsx` existing unused.

**Design**
- Lost-mode card (`rounded-2xl`, red border+glow) and normal card (`rounded-3xl`, glass) use different corner radii — inconsistent shape language for the same list.

**Logic**
- Category chosen at claim time is never persisted or shown here (see §9) — no grouping/filtering possible even if desired later.
- Disabling Lost Mode resets `lostMessage`/`rewardAmount` to empty — loses a drafted message if the owner meant to pause rather than fully reset.

---

## 5. NFC Setup (`src/pages/dashboard/NfcSetup.jsx`)

**UX/UI**
- Page's own footer text admits self-serve claiming "isn't wired up yet" — the Generate → Write → Simulate Tap flow currently ends in a dead end for a real self-service owner. This is the single largest logic/UX gap in the app.
- "Simulate Tap" and "Test" both open the tap URL but behave differently (same-tab nav vs new tab) with no visual distinction — easy to confuse.

**Design**
- `STEPS` data is numbered 1–4 but the page has no stepper/progress indicator showing where the user currently is in the flow.

**Logic**
- **Core gap:** a tag id generated on this page has no relationship to the admin-provisioned `tags` collection required by `ClaimTag.jsx`'s transaction (`tagSnap.exists()` fails for a self-generated id). Product intent needs resolving first:
  - (a) Make this page purely educational/write-an-existing-provisioned-tag, and stop implying self-serve generation is a real path, **or**
  - (b) Align the claim transaction to accept self-generated ids.
  - Resolve this before further polishing the UI.

---

## 6. Messages (`src/pages/dashboard/Messages.jsx`)

**UX/UI**
- No control to filter Open vs Resolved conversations.
- Long finder messages rely only on CSS `truncate` — no explicit length handling.

**Design**
- List uses the same generic `MessageSquare` icon for every row, making the list visually monotonous when scanning many conversations.

**Logic**
- Read-state convergence between this list and `Chat.jsx`'s own `markChatRead` effect (triggered via Notifications deep-link) should be verified in QA — both paths appear to converge correctly, but worth confirming there's no race.

---

## 7. Notifications (`src/pages/dashboard/Notifications.jsx`)

**UX/UI**
- No "mark all as read" bulk action.
- No delete/clear affordance — list grows unbounded indefinitely.

**Design**
- Consistent with Messages list styling — no changes needed structurally.

**Logic**
- `TYPE_META` only defines `report` and `message` types; anything else silently falls back to the message icon/label with no visible indication.
- No visible pagination/limit in the notifications hook — long-lived accounts could load large lists on every dashboard visit.

---

## 8. Settings (`src/pages/dashboard/Settings.jsx`)

**UX/UI**
- Entire page is currently non-functional — file has an explicit `TODO(sprint 2)` comment. Phone number and notification toggles aren't persisted, and "Save" does nothing. Highest-priority logic fix: the target schema already exists (`Register.jsx` writes `phone` and `notificationPrefs` to `users/{uid}`), so this is completing existing intent, not adding a new feature.

**Design**
- Layout is fine and consistent with `GlassCard` usage elsewhere.

**Logic**
- No read of the existing `users/{uid}` doc on mount — toggles always reset to the hardcoded default regardless of the real stored values.
- Uses a raw `<input type="checkbox">` instead of the app's own `ui/switch.jsx` component used for the same on/off concept in `Items.jsx` — inconsistent control choice.

---

## 9. Claim Tag (`src/pages/dashboard/ClaimTag.jsx`)

**UX/UI**
- The category selector's own helper text admits "categories aren't stored yet" — asking the user to fill a field that's discarded is a trust issue, not just copy.
- NFC-scan error state doesn't distinguish "no tag detected" from "tag detected but couldn't parse an id" — both show the same generic message.

**Design**
- Consistent with the rest of the dashboard forms — no issues.

**Logic**
- `category` is captured in form state but never included in the Firestore transaction write (`itemRef` set omits it) — confirmed dead field. Either wire it into the write (and update rules/schema accordingly) or remove the control since it currently misleads the user.

---

## 10. Chat — owner & finder shared view (`src/pages/public/Chat.jsx`)

**UX/UI**
- No message timestamps inside the thread itself (only relative time in list views) — hard to judge staleness mid-conversation.
- No scroll-to-bottom affordance when scrolled up — auto-scroll always forces to bottom, which can yank a user reading history.
- Quick-replies row has no visual indication of overflow (relies on unstyled native horizontal scroll) — easy to miss options off-screen.

**Design**
- Message bubble roles (`mine` vs other) are handled correctly (accent for self, neutral for other), but finder-side bubble text (`white/60` background) should get a contrast check.

**Logic**
- Owner can report/block a finder; there's no reciprocal action for a finder against an abusive owner — asymmetric moderation. Worth flagging as a scope decision even if not fixed now.
- `notifyOwner(...).catch(() => {})` in the report flow silently swallows notification failures with no retry/log.

---

## 11. Public NFC landing / finder report (`src/pages/public/NfcLanding.jsx`)

**UX/UI**
- "Share my current location" disables itself once done, with no way to re-share/update if the finder moves before submitting.
- The message field is required while location/GPS are optional, but nothing visually signals which fields matter most for a fast owner response.

**Design**
- Strong and on-brand; the lost-mode pulsing red glow is an effective signal. No major issues.

**Logic**
- Confirm banned-token checks (`lib/moderation.js`) are actually enforced *before* `submitReport`/`sendChatMessage`, not just surfaced to admins after the fact — closing this would prevent banned finders from continuing to file reports/messages.

---

## 12. Admin — Inventory (`src/pages/admin/Inventory.jsx`)

**UX/UI**
- No confirmation step before generating a batch — misclicking "Generate batch" with size 500 selected commits immediately.
- CSV export only covers the batch just generated in-session (`lastBatch`) — no export of a filtered/searched view of existing inventory.
- Table search matches tag id/batch number only — can't combine free-text search with status filtering in one query.

**Design**
- Deliberately solid, non-blurred surfaces for table performance — correct call, no changes needed.

**Logic**
- `nextBatchNumber()` reads then writes without a transaction — two admins generating batches near-simultaneously could collide on the same batch number.
- Row limit hardcoded at 100 with no pagination — inventory beyond 100 tags becomes invisible in the table even though the KPI counts remain accurate.

---

## 13. Admin — Moderation (`src/pages/admin/Moderation.jsx`)

**UX/UI**
- No filter/search across reported chats — becomes an unsorted flat list as reports grow.
- No link from a moderation row into the actual chat thread for full context — admin judges solely from `blockedReason`.

**Design**
- Consistent with Inventory table styling — no changes needed.

**Logic**
- Bans are keyed on `finderSessionToken`, a localStorage-scoped identity — clearing browser storage or switching browsers trivially evades a ban. Worth documenting as a known limitation.

---

## 14. Navigation shell (`TopNav.jsx`, `DashboardSidebar.jsx`, `AdminSidebar.jsx`)

**UX/UI**
- Sidebars are `fixed` with hardcoded `w-56` / `ml-56` — no collapse or responsive behavior; tablet-width breaks the layout, and there's no mobile nav at all for dashboard/admin shells.
- Deep pages (Chat, ClaimTag) rely only on `BackButton` with no page-context header/breadcrumb.

**Design**
- Dashboard and Admin sidebars are near-duplicate shells with copy-pasted logo blocks — any rebrand requires editing both files.

**Logic**
- `DashboardSidebar` and `Notifications.jsx` both call `useOwnerNotifications(user)` independently — verify this doesn't create duplicate Firestore listeners per mount (perf check).

---

## 15. Global design system (neumorphic + glass theme)

**Design**
- Two surface languages coexist without a documented rule: neumorphic (`shadow-neu-*`, nav/buttons) vs glassmorphism (`bg-white/70 backdrop-blur`, content cards). Both are intentional per inline comments, but the decision rule for which to use where should be written down to keep future work consistent.
- "Danger/lost" color isn't unified: `red-400` border+glow (`GlassCard` lost state), `red-600`/`rose-600` badges (Inventory), `destructive` badge variant (Items) — at least three different reds for the same semantic meaning.
- No documented focus-ring/contrast audit across custom buttons and switches; light text (`text-slate-500`) on glass backgrounds (`bg-white/60`) risks contrast failures in bright ambient light.

---

## Priority ranking (highest impact first, no new features)

1. **NFC Setup ↔ Claim Tag mismatch** — self-serve generate flow leads nowhere; resolve product intent before touching visuals.
2. **Settings page** — currently fully decorative; wire existing fields to the existing Firestore schema.
3. **ClaimTag's dead `category` field** — either persist it or remove it; it currently misleads the user.
4. **Items.jsx Lost Mode off-toggle** — add confirmation/undo to match the on-toggle's care level.
5. **Auth error messaging** — replace raw Firebase error strings with mapped, friendly copy; fix the reset-message styling collision.
6. **Unify "alert/lost" red** and document the neumorphic-vs-glass surface rule — a single design-system pass fixes consistency across every page above.
7. **Sidebar responsiveness** — no mobile/tablet layout currently exists for the dashboard/admin shells.
8. **Admin Inventory** — add a confirmation gate before large batch writes; add pagination beyond 100 rows.
9. **Moderation ban evasion** — document the limitation; decide later whether to strengthen identity beyond session token.
10. **Dashboard multi-incident support** — currently only surfaces one open report at a time.
