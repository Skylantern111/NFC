# TagBack — UI/UX Improvement, Round 2

Status: **Part A implemented** (commit `9c66d23`, deployed 2026-09-29).
**Part B implemented** 2026-09-29, except real-device checks (B11): real NFC
hardware, TalkBack and VoiceOver are not verified. Date: 2026-09-29.
Follows [UI_UX_IMPROVEMENT_PLAN.md](UI_UX_IMPROVEMENT_PLAN.md) (round 1).

This round improves the existing UI. It doesn't redesign the system:
Firebase, the data model, the NFC architecture, the roles and the visual
identity stay as they are. The question for every change is: *does this make
it easier to understand what is happening and what to do next?*

**Severity:**
- **Critical:** a user can fail a core task, or the UI says something untrue.
- **High:** a core task is confusing, or important feedback is missing.
- **Medium:** friction, inconsistency, or a weak state.
- **Low:** polish.

**Complexity:** S (under an hour, one file), M (a few files), L (a new flow).

---

## Contents

- [Part A — Done in this round](#part-a--done-in-this-round)
- [Part B — Next improvements](#part-b--next-improvements) (implemented)
- [Part C — Not UI problems](#part-c--not-ui-problems)
- [How it was checked](#how-it-was-checked)

---

## Part A — Done in this round

### A1. Finder page (`public/NfcLanding.jsx`) — Critical
- Leads with "You found a TagBack item", the item name, lost badge, reward
  and the owner's message.
- One main action: **Send message to owner**, full width, visible without
  scrolling at 320 px.
- Location is optional and folded behind **Add where it is (optional)**.
  **Remove location** after sharing.
- Empty message: error next to the field, focus moves there (was a toast).
- Owner links moved below the form. A plain "Your privacy" list sits at the
  bottom.

### A2. NFC scanning (`components/NfcScanPanel.jsx`, `dashboard/ClaimTag.jsx`) — High
- States: "Ready to scan" → "Looking for NFC tag…" → "Tag detected", or
  "NFC scan failed" with tips.
- Picture of a phone with the tag on its back; the pulse respects reduced
  motion.
- **Enter Tag ID manually** on every state; it stops the scan and focuses
  the ID field.
- Clearer message when the browser has no Web NFC.

### A3. Chat (`public/Chat.jsx`) — High
- **Read-only bar** where the message box would be, with the reason (admin
  view, wrong browser / not the owner, tag deactivated).
- Reads the tag's status, so a finder on a blacklisted tag is told before
  sending instead of every send failing.
- Finder continuity: "Keep this link to come back", same-browser rule,
  what happens on another device, and "anyone with the link can read it".
  A copy-link button stays in the header after the tip is dismissed.
- "Waiting for the owner/finder to reply" hint; privacy line above the box.
- Report dialog has a visible label and a 500-character limit.

### A4. Lost Mode (`dashboard/Items.jsx`) — High
- Confirm dialog explains what Lost Mode does; button "Turn on Lost Mode".
- Success state on the card: "Lost Mode is now active" + link to see what
  finders see.
- Editing the message is its own dialog with **Save changes**.

### A5. Privacy copy made true — Critical
UI said things the system didn't do (`SYSTEM_DOCUMENTATION.md` §26):
- **G-P1:** GPS coordinates were copied into the chat, which recovery can't
  clear. Now they stay on the report only.
- **G-P2:** release "deleted chats" but left their messages. Now
  `clearTagHistory()` deletes them; a new rule lets the tag owner delete
  messages of unreported chats only.
- Copy updated on: Privacy page, release dialog, delete-account dialog,
  tap-page contact hint, Dashboard intro.

### A6. Error screens (`ErrorBoundary.jsx`, `RouteErrorBoundary.jsx`) — High
- No stack traces for users. **Try again**, **Go home**, a reference code.
- The code is written into the `clientErrors` message so an admin can find
  it. Dev builds still show the stack.

### A7. Dashboard hierarchy (`dashboard/Dashboard.jsx`) — Medium
- Order: Action needed → reminders → Your items (counts) → Recent activity.
- Incident cards start with "Someone found your item".

### A8. Phone navigation (`nav/SidebarShell.jsx`, `nav/DashboardSidebar.jsx`) — Medium
- Bottom bar: Home, Items, Messages, Alerts. Drawer: Settings, Privacy,
  Log out only. The menu dot counts drawer items only.

### A9. Accessibility and polish — Medium
- Filters use `aria-pressed` toggle buttons in a labelled group (Messages
  had tab roles without panels).
- Labels for Inventory search and admin reason fields; tap-page field
  errors linked with `aria-describedby`; chat list announces new messages.
- Reduced motion also stops transitions and smooth scrolling.
- Recovery stepper labels fit at 320 px (were cut to "Fo…", "Tal…").
- Touch targets raised to 44 px on filters, quick replies and small actions.
- Clearer empty states and labels ("Back to inventory", "Report
  conversation", "Cancel scan").

---

## Part B — Next improvements

Status: **implemented 2026-09-29** except the real-device checks in B11.
Each item says what was done and where.

### B1. A failed list looked like an empty list — High · Implemented
**Problem:** the owner listeners in `lib/ownerItems.js` treated an error as
"done, no data", so a permission error or dead connection showed "No items
yet" or "All clear".
**Done:**
- `useOwnerTagIds`, `useOwnerItems`, `useOwnerOpenReports`, `useOwnerChats`
  and `useOwnerNotifications` now return `error` and a stable `retry`, like
  `useChat`. Loading stops on error instead of showing empty.
- New `LoadErrorState` (`components/States.jsx`) picks the message:
  offline ("You're offline"), `permission-denied` ("You don't have access to
  this"), or anything else ("We couldn't load …"), with **Try again**.
- Used on Dashboard, My Items, Messages and Notifications. The empty state
  and the Dashboard counts are hidden while there is an error.

### B2. Finder couldn't get back to their chat from the tag — High · Implemented
**Done:** after a report is sent, `lib/finderSession.js#rememberChatForTag`
stores the chat id under `tagback_finder_chat_<tagId>` (one entry per tag,
written once). On the tag page, a stored id that still exists (checked with
one public `get`) shows **Continue your conversation** above the form, with
"saved in this browser; on another browser or device, open the chat link
you saved". The new-report form stays below as "Or send a new message".
Malformed values are ignored and removed. No rules change.

### B3. Items couldn't be renamed — Medium · Implemented
**Done:** **Edit item…** in the ⋯ menu on My Items opens a dialog with the
current name and category. Shared with the claim page:
`components/ItemDetailsFields.jsx` (fields) and
`lib/categories.js#validateItemDetails` (rules: required, ≤ 100 characters,
listed category). Saves with `lib/ownerItems.js#updateItemDetails`; the
existing rules already allow it (`items` update: `ownsTag` +
`publicItemFieldsOnly`). Hidden for blacklisted tags, like the other actions.

### B4. Owner couldn't change their display name — Low · Implemented
**Done:** a **Name** field in owner Settings → Account (required, ≤ 80).
Saves the Auth profile and `users/{uid}.displayName` (already allowed for
the owner), then `AuthContext#refreshProfile` re-renders names elsewhere
("Hi, …" on the Dashboard). Hint: shown only to the owner and admins.

### B5. Dashboard "Open reports" opened a different list — Medium · Implemented
**Done:** the tile is now **Open chats** and counts chats not marked
recovered — the same thing Messages' "Open" filter shows. Chats are what the
owner acts on, so that meaning was kept.

### B6. Admin-edit warning showed for any other editor — Low · Implemented
**Done:** `NfcSetup.jsx` shows "Last edited by a TagBack admin" only when
the saved profile has `editorRole: 'admin'` (a field only a real admin can
write) and the editor isn't the current user.

### B7. Recovery left no trace — Medium · Implemented
**Done:** a **Recovered** section on My Items lists chats the owner marked
recovered, with the item name, "Marked recovered · last message …" and a
link to the chat. Built from existing chat data; no new collection.
Released tags delete their chats, so only tags the owner still has appear.

### B8. Admin preview mode — Low · Implemented
**Done:** Inventory checks `firebaseReady` before every query and write. In
preview mode it shows four sample tags (one per status plus a failed write)
and "Preview mode — sample tags only. Nothing is saved."; actions show that
note instead of writing. The test-tag card in admin Settings says the same
instead of trying to write.

### B9. Remaining confirmations — Low · Implemented
- Admin Settings **Turn off** (admin sign-up passcode): "Turn off admin
  sign-up?" explains nobody can create an admin account until a new
  passcode is set, and existing admins keep access. Buttons: Cancel /
  Turn off.
- Inventory **Unblacklist**: the app first works out the status to restore
  (same logic as before), then asks "Unblacklist TB-…?" naming it —
  "goes back to Claimed. Its owner keeps it…" or "goes back to Registered:
  ready to be claimed…". Buttons: Cancel / Unblacklist.

### B10. Button casing — Low · Implemented
Every label in `src/` was checked. Sentence case was already used for all
actions; only page and feature names are capitalized ("My Items", "Lost
Mode"). The rule is now written in
[LIGHT_NEUMORPHIC_REDESIGN_PLAN.md §6](LIGHT_NEUMORPHIC_REDESIGN_PLAN.md#6-copy-conventions-ui_ux_improvement_round2md-b10),
including "…" for menu items that open a dialog (so "Edit item…").

### B11. Checks — High · Partially done
See [How it was checked](#how-it-was-checked). Real NFC hardware, TalkBack
and VoiceOver are **not verified**.

### Found and fixed during the B11 checks
- **Focus was lost after closing dialogs.** Dialogs opened from a ⋯ menu
  (Edit item, Release, Blacklist, Unblacklist), from a card button (Report
  lost) and the phone drawer returned focus to `<body>`. New
  `hooks/useReturnFocus.js`, used by the shared `ui/dialog.jsx` and
  `ui/sheet.jsx`, remembers the control focused before opening and returns
  focus to it; menu cases also use `lib/utils.js#returnFocusTo`.
- **Landscape chat hid the messages.** At 740×360 the message area was
  32 px tall. Notices (finder tip, read-only reason, recovered note) now
  scroll with the thread, and quick replies and the privacy line hide when
  the screen is under 500 px tall. Message area is now 216 px at 740×360.
- **Red buttons failed contrast in dark mode.** White text on the light
  red dark-theme colour (≈ 2.4:1). The button now uses the theme's
  `destructive-foreground` (dark text in dark mode, white in light mode).
- **Preview data:** mock items now have categories, and there is one
  recovered mock chat, so preview mode shows B3 and B7.
- Empty chat message is no longer full-height, so it doesn't push notices
  out of view.

---

## Part C — Not UI problems

Found while working on the UI. They need rules or backend changes, so the
UI shouldn't pretend to fix them. Details in `SYSTEM_DOCUMENTATION.md` §26.

| Issue | Why the UI can't fix it |
|---|---|
| An owner can edit or delete their own chats, including a finder's report against them | Rules allow any owner update on the chat (G-S1) |
| Anyone with a chat link can read it and reply as its finder | Finder identity is a browser token stored on the chat |
| Text a finder types stays in the chat until release | Messages are immutable by design; the Privacy page now says so |
| Finder bans are bypassed by clearing browser data | Needs a stronger finder identity (App Check is the named fix) |
| Admins can write any `users` field | Rules have no field list for admin updates (G-S2) |

---

## How it was checked

### Done
- `npm run build` passes. `npm test`: 107/107 rules and flow tests
  (Firestore emulator).
- Browser checks in headless Chrome driven over the DevTools Protocol, in
  preview mode (Firebase config blanked — no production data read or
  written). Viewport and colour scheme emulated; Chrome's own keyboard
  events sent.
- **Layout:** 14 routes (landing, finder, chat, dashboard, items, claim,
  messages, notifications, settings, privacy, login, inventory, moderation,
  admin settings) at 320, 375, 390 and 430 px, in light and dark mode — no
  horizontal overflow, no controls pushed off-screen, no console errors.
  Key pages also at 768 and 1280 px (Part A round).
- **Landscape chat:** 740×360 and 844×390, light and dark — composer
  visible, message area 216–246 px, no horizontal scroll.
- **Part B features (preview mode):** B2 continue card shows for a stored
  chat and ignores a malformed value; B3 edit dialog prefilled, empty name
  shows the field error with focus, saving updates the list; B5 tile reads
  "Open chats"; B7 Recovered section; B8 four sample rows and the preview
  note, no errors.
- **Keyboard:** Tab to ⋯ menu, Enter opens it, arrows move, Enter opens the
  dialog; focus stays inside over 8 Tabs and Shift+Tab; Escape closes and
  focus returns to the opener (items menu, Report lost, Release, chat
  report, Inventory row menu, phone drawer); Release confirm focuses Cancel
  first; Messages filter toggles with Space (`aria-pressed`, URL updates);
  chat Enter sends; report dialog focuses the reason field (500 limit).
- **Part A regressions:** finder page texts and location block, no-NFC
  message, chat continuity tip and privacy line, Dashboard order, bottom
  tabs, Lost Mode dialog — all present.

### Not done / not verified
- **Real Firebase end to end** (sign-up, claim, report, chat, recovery,
  release against a real project). Preview mode uses mock data.
- **B1 error states in a browser.** Preview mode can't produce a listener
  error; checked by reading the code paths only. Offline vs permission vs
  failed copy is not browser-verified.
- **B4** Name field is hidden in preview mode (no signed-in user), so it
  was checked by build and code only.
- **B9** confirm dialogs: Turn off and Unblacklist need real Firebase data
  to open (preview mode shows the preview note instead). Not opened in a
  browser.
- **Real NFC hardware** (claim scan, admin register/write): not verified.
  Scan states were checked with a simulated `NDEFReader` in the Part A
  round.
- **TalkBack and VoiceOver:** not verified. Only markup-level checks
  (labels, `aria-describedby`, live regions, focus order).




- Deploy retry: the first deploy attempt failed before uploading anything. The Firebase command line got a web page back instead of data, most likely a network or login blip. The retry went through completely.
- Database rules: unchanged this round. They were deployed again alongside the website, as DEPLOY.md asks.
- main is behind again: I deployed from tag-content-security-audit, and main hasn't been updated with this round yet. Say "merge" and I'll fast-forward it like last time.
- CI: I can't see whether GitHub CI passed. Check GitHub → Actions.

Your part

Everything below needs a real phone, a real account, or your decision. I can't do these from here.


3. Account housekeeping
- [ ] Make sure your own admin account's email is verified. Unverified passcode admins no longer get admin rights.
- [ ] Delete test or wrong-email accounts in the Firebase console (docs/FIREBASE_SETUP.md, "Cleaning up wrong-email accounts").

4. Decide on the security issues (docs/UI_UX_IMPROVEMENT_ROUND2.md Part C). The most important: an owner can delete a finder's report against them. The fix is a database rule change, and I can do it next if you want.

5. For your thesis
- [ ] Run a short test with 3–5 people who have never seen TagBack. Give them a tagged item and ask them to "return it". Watch where they hesitate.
- [ ] Take screenshots of the new flows for your write-up. SYSTEM_DOCUMENTATION.md is your technical reference.

Send me whatever breaks in step 1 or 2 and I'll fix it.