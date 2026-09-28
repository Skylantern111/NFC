# TagBack — UI/UX Improvement Plan

Status: **implemented in code, 2026-09-28 — not yet tested in a browser or on a phone** (see "Implementation status" at the end). Date: 2026-09-28.
Code audited: branch `tag-content-security-audit` at `19ff8c6`.

This plan improves the existing UI. It does not redesign the system. The
light neumorphic/glass direction in
[LIGHT_NEUMORPHIC_REDESIGN_PLAN.md](LIGHT_NEUMORPHIC_REDESIGN_PLAN.md) stays
the base. Firebase, the data model, the rules, the NFC logic and the
workflows in [`../ARCHITECTURE.md` §8](../ARCHITECTURE.md#8-system-workflows)
stay as they are.

**How this audit was done:** by reading the source of every page and shared
component. No browser pass at the listed widths has been done yet. Items
marked *(verify)* are likely from the code but need a check in a real
browser before they are fixed.

**Severity:**
- **Critical:** a user can fail a core task or take a wrong action.
- **High:** a core task is confusing, or important feedback is missing.
- **Medium:** friction, inconsistency, or a weak state.
- **Low:** polish.

**Complexity:** S (under an hour, one file), M (a few files or a new shared
component), L (many files or a new flow).

---

## Contents

- [What already works (keep)](#what-already-works-keep)
- [0. Reported bugs (tester feedback)](#0-reported-bugs-tester-feedback-2026-09-28)
- [A. UI/UX audit](#a-uiux-audit)
- [B. Design system proposal](#b-design-system-proposal)
- [C. Screen-by-screen plan](#c-screen-by-screen-plan)
- [D. Implementation order](#d-implementation-order)
- [E. Files to modify](#e-files-to-modify)
- [F. Files that should not change](#f-files-that-should-not-change)
- [G. Testing checklist](#g-testing-checklist)
- [H. Rules for the implementation](#h-rules-for-the-implementation)

---

## What already works (keep)

These are good and should be kept, not rebuilt:

- **Password UX on signup** (`components/SignupForm.jsx`): live requirement
  checklist with check icons, strength bar, show/hide on both fields,
  "Passwords match" feedback, `aria-live` on the checklist.
- **Login** (`auth/Login.jsx`): show/hide password, `Signing in…` button
  state, inline reset link with its own busy state, friendly auth errors
  (`lib/utils.js#friendlyAuthError`), return to the page the user came from.
- **Destructive confirmations with consequences spelled out:** release tag,
  turn off Lost Mode, delete account (type `DELETE` + password), mark
  recovered, report chat, blacklist tag.
- **Button busy states** on most async actions (`Saving…`, `Releasing…`,
  `Claiming…`) with the button disabled while busy.
- **Skeletons** on Dashboard, Items, Messages, Notifications, admin tables.
- **Empty states with an icon, text and an action** on Items, Messages,
  Notifications and the Dashboard.
- **Chat scroll behavior:** only auto-scrolls when the reader is at the
  bottom; "scroll to latest" button otherwise. Failed sends restore the draft.
- **Finder landing** (`public/NfcLanding.jsx`): no account needed, owner's
  message shown clearly, privacy note, optional location, "leaving TagBack"
  page for owner redirects.
- **One shared sidebar shell** for owner and admin (`nav/SidebarShell.jsx`),
  with a mobile top bar and slide-in drawer, and an amber admin accent.
- **Route error boundary** with a Retry button; lazy-loaded dashboard/admin.
- **Semantic tokens with checked contrast** in `src/index.css`, and a
  complete dark theme.
- `prefers-reduced-motion` already stops all animation (`src/index.css`).

---

## 0. Reported bugs (tester feedback, 2026-09-28)

Source: the testers' document (Tab 1: three phone screenshots with notes;
Tab 2: their written walkthrough of the system). The screenshots were taken
on an Android phone, inside **Facebook Messenger's in-app browser**: the
page header says "Messenger". That matters for BUG4 and BUG6.

These are fixed **first**, before any design work (see D, step 0). Unlike
the rest of this plan, BUG3, BUG4 and BUG6 touch logic (one extra write,
one role check, the location call). Each one says exactly what changes.

### 0.1 What the testers reported, and the cause found in the code

| ID | Tester report | Cause in the code | Severity | Fix | Cx |
|---|---|---|---|---|---|
| BUG1 | Claim tag: the Category field looks broken ("parang sira ung UI dun sa may icon"). The icon sits **above** "Luggage". | `ui/select.jsx` fixed this for the **dropdown list** (the `ItemText` span got `flex`), but the **closed field** shows the value through `<SelectValue/>`. That renders a plain span, and Tailwind's preflight makes the `<svg>` `display: block`, so the icon goes on its own line. `ClaimTag.jsx:252–253`. | Medium | Give `SelectValue` (or the trigger's value slot) `flex items-center gap-2` inside `ui/select.jsx`, so every select with icons is fixed at once. | S |
| BUG2 | Finder page: the red button's **text can't be seen** ("ung choice ng color ng text hindi visible"). Chat: the green "Mark as recovered" button looks **empty** in the screenshot. | The default `Button` wraps its label in a span with **gradient text** (`bg-clip-text text-transparent`, `ui/button.jsx`). Pages that paint the button red, green or with a gradient still get that purple→pink text, which disappears on those fills. Four places: `NfcLanding.jsx:558` (Report found item, red), `NfcLanding.jsx:303` (Claim this tag, gradient), `Chat.jsx:282` (Mark as recovered, green), `Chat.jsx:409` (Confirm recovered, green). | **Critical** | Short term: pass a variant (`destructive` / new `success` / new `primary`) so the label isn't gradient text. This is DS1 done early for these four buttons. Add a guard in `button.jsx`: when a `className` sets a `bg-` fill, don't use gradient text. | S |
| BUG3 | Finder: "What is this input box for? When I send a message I don't know where it goes." Owner: "sometimes the owner can't see the finder's chat". | The required **"Message to the owner"** on the finder page is saved only on the `reports` doc (`initialMessage`) and as the chat preview (`lastMessageText`) — **never as a chat message** (`NfcLanding.jsx:218–224`). So after sending, both people open a chat that says "No messages yet. Say hello". The finder's first message looks lost, and the owner only sees it as a line on the Dashboard card. This is the confirmed version of CHAT6. | **Critical** | After the chat is created, also write the finder's text as the **first message** (`chats/{id}/messages`, `sender: 'finder'`, with the finder token). The current rules already allow that write; no rules change. Also show the report details (location note, map for the owner) as a pinned card at the top of the thread (CHAT6). Add the step to `tests/flows.test.js`. | S |
| BUG4 | Finder: "sometimes I can see the owner's messages but can't reply", "sometimes I can't send or receive". | The finder's identity is a random token in `localStorage` (`lib/finderSession.js`). The report is filed in one browser (the one that opened on the tap, usually Chrome). If the chat link is then opened in **another** browser — here, Messenger's in-app browser — that browser has a different token. Reading works (messages are readable by chat ID) but every send is rejected by the rules, and the page only says "This device can't send messages right now." The same happens to an **owner** who opens the chat link while signed out (e.g. in Messenger): `Chat.jsx:111` treats anyone who isn't the signed-in owner as the finder. | **High** | In `Chat.jsx`, compare `chat.finderSessionToken` with this browser's token (the chat doc is already readable). If neither matches and the user isn't the owner, show a clear **read-only** state: "You're viewing this chat from a different browser. Open it in the browser you used to report the item, or sign in if you're the owner." Hide the composer, with a "Sign in" button. Also FIND7 (tell the finder to keep this page / copy the link and open it in the same browser). No rules or data change. | M |
| BUG5 | "Sometimes it works, sometimes it doesn't" for receiving messages. | Two code-level causes. (a) `useChat`, `useChatMessages` and `useOwnerChats` ignore listener errors (`() => setLoading(false)`, `ownerItems.js:314, 745, 770`). A failed listener stays dead with no message and no retry. (b) `Chat.jsx:157`: pressing Send before the page knows the viewer's role does nothing, silently. In-app browsers such as Messenger also drop the realtime connection when the app goes to the background. *(verify on a phone: whether messages arrive after switching apps and back)* | High | Show an error state with **Retry** when a listener fails, and re-subscribe on `visibilitychange`/`online`. Disable the composer with "Connecting…" until the role is known (CHAT9). Pending/sent/failed marks on each message (CHAT2). If the Messenger problem is confirmed, set Firestore to long polling for in-app browsers (`initializeFirestore(app, { experimentalForceLongPolling: true })` only when the user agent is an in-app browser). This one needs a decision, because it changes `firebase/config.js`. | M |
| BUG6 | "The location also has problems sometimes — or maybe it's just the internet?" | `lib/geolocation.js` asks for high-accuracy GPS with an **8-second timeout** and no cached position. Indoors, GPS often takes longer, so it returns nothing. Denied permission, timeout and unsupported all show the same word: "Unavailable". In-app browsers (Messenger) often block location entirely. | Medium | Try high accuracy with a 15 s timeout, then fall back to low accuracy (network location) with `maximumAge: 60000`. Return the **reason** (denied / timeout / unsupported) and show a matching message: e.g. denied → "Location is blocked. Type where you left it instead." Keep the 4-decimal rounding exactly as it is (privacy). Plus FIND3. | S |
| BUG7 | Chat header "broken, text and buttons not placed properly". The screenshot shows "You are the owner. Contact details stay hidden." wrapped one word per line and the buttons squeezed. | Confirms CHAT1: back button, title, subtitle, "Report" and "Mark as recovered" are all in one row with no wrapping rule. | High | CHAT1: compact header (back, item name, status), "Report" in a "⋯" menu, and "Mark as recovered" in a banner above the composer. | M |
| BUG8 | Finder page: purpose of the fields is unclear; the required message is below optional location fields. | Confirms FIND2/FIND3: location button and "Location note" come first; the required message comes last; nothing says the message goes to the chat. | High | FIND2/FIND3, and a hint under the message field: "This starts a private chat with the owner." | S |

### 0.2 Gaps between the testers' walkthrough (Tab 2) and the system

The testers' own guide shows where the UI misled them. These are not code
bugs; they are wording and flow problems to fix in the UI, plus
corrections for the guide itself.

| ID | What the guide says | What the system does | Fix |
|---|---|---|---|
| GUIDE1 | Owner copies "the link at the top" of the item Profile and **writes it on the NFC sticker**. "Put the item link, not the website URL." | The admin writes the sticker once, at registration (`admin/NfcRegister.jsx`). It always holds `/nfc/<TagBack ID>`. The profile changes what that link shows; the owner never rewrites the sticker (ARCHITECTURE §7). | On the tap page editor, state it plainly: "Your sticker already points here. Changes show on the next tap — no need to rewrite the sticker." Show the tap link with a **Copy** button (useful for testing and for writing a replacement sticker), and label it "Tap link". Correct the guide. |
| GUIDE2 | "After claiming, a button appears to turn on the Lost Alarm." | After claiming, the owner lands on My Items with a small switch. | NFC7 + ITEM1: after claim, highlight the new item and show "Report lost" as a clear button. |
| GUIDE3 | Terms: "Register Item", "Lost Alarm", "Profile", "Registered Tag". | UI terms: "Claim a tag", "Lost Mode", "NFC profile", "NFC Register". | Pick one set and use it everywhere (UI and guide). Proposal: **Claim tag**, **Lost Mode**, **Tap page**, **Register tags** (admin). |
| GUIDE4 | After release, the sticker must be **re-programmed** before another item can use it. | Release unlinks the tag; the sticker keeps the same link and can be claimed again with the same TagBack ID. No rewrite is needed (the release dialog already says the sticker is unaffected). | Correct the guide. Add "It can be claimed again with the same TagBack ID" to the release success message (REC3). |
| GUIDE5 | The finder "confirms they found the item through the button", then the owner is notified and can see it on the Dashboard. | Matches (report → notification → Dashboard incident card). | None. BUG3 makes the finder's message actually appear in the chat. |

---

## A. UI/UX audit

IDs are used in later sections and in commit messages
(e.g. "UI_UX_IMPROVEMENT_PLAN.md N2").

### A.1 Design system and shared components (DS)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| DS1 | All | The default `Button` is a grey neumorphic pill with gradient **text**. It looks the same weight as secondary buttons. Pages work around this with one-off classes: `NfcLanding` uses a purple→pink **fill**, the report button is solid red, Chat uses solid emerald. There is no single "primary" look. | High | Users can't tell the main action from the others; each screen teaches a different rule. | Add a real `primary` variant (solid brand gradient fill, white text) and a `success` variant. Keep today's neumorphic style as `secondary`. Replace the one-off class overrides. | M |
| DS2 | All owner/public pages | Glass card styles are copied as local constants: `const glass`/`GLASS` in Items, Messages, NfcSetup, Notifications, Chat, NfcLanding, with different radii (`rounded-2xl` vs `rounded-3xl`) and shadows. `GlassCard` exists but is used only in a few places. | Medium | Small visual drift between pages; every style change needs 6+ edits. | Make `GlassCard` (or a `Card` variant) the only glass surface, with `size` and `tone` (`default`/`lost`/`warning`/`success`) props. | M |
| DS3 | All | No shared **status badge**. The same state has different labels and colors: "Lost" / "Reported lost" / "Lost status" / "In lost mode"; "Found reported" / "Report open" / "Active found-item report"; "Resolved" / "Recovered". | High | Users can't build a model of the item lifecycle. | One `StatusBadge` with a fixed set of states, labels, icons and colors (see B.7). Use it everywhere. | M |
| DS4 | All | No `PageHeader`. Each page writes its own `h1` with different spacing; the Dashboard has **no page title** at all. | Medium | "Where am I?" is not answered consistently. | `PageHeader` with title, optional description, optional back link, and an action slot. | S |
| DS5 | All | No shared `EmptyState`, `ErrorState` or `LoadingState`. Each page hand-builds them; several pages have only a spinner and "Loading…". | Medium | Inconsistent; some states are bare. | Three small components; see B.9. | M |
| DS6 | All forms | Error text is a plain `<p className="text-red-500">` under the form, not linked to a field (`aria-describedby`), not announced (no `role="alert"`) in most places. | High | Screen-reader users miss errors; sighted users must find which field is wrong. | `FormField` wrapper: label, control, hint, error; sets `aria-invalid` and `aria-describedby`; error has `role="alert"`. | M |
| DS7 | All | Only one `ConfirmDialog` pattern exists by copy-paste (Items has three nearly identical dialogs; Chat two; Settings one). | Low | Harder to keep wording and button order consistent. | `ConfirmDialog` component: title, consequence text, "can't be undone" flag, confirm label, tone, busy state. | S |
| DS8 | Skeleton | Skeleton fill is pink (`bg-pink-100`). On the light canvas it reads as a brand highlight, not a placeholder. | Low | Loading looks like content. | Use a neutral `bg-slate-200/70` (dark: `bg-white/5`). | S |
| DS9 | Lost cards | Lost items use a red glow **and** a pulsing animation (`animate-pulseGlow`) on the owner's list, the finder page and `GlassCard lost`. | Medium | Constant pulsing is alarming and distracting; it repeats on every lost card. | Keep the red border + "Lost" badge. Remove the pulse, or play it once on state change. | S |
| DS10 | Typography | Many sizes are ad hoc: `text-[10px]`, `text-[11px]`, `text-xs` for body copy, `uppercase tracking-wide` labels on almost every card. | Medium | Low readability on phones; everything shouts equally. | Type scale in B.2; minimum 12 px for any text, 14 px for body. | M |
| DS11 | Touch targets | Many controls are 32–36 px (`h-8`, `h-9`, `size-8`), the password eye icon is a 16 px icon with no padding, the stale-nudge dismiss is ~28 px. | High | Hard to tap on phones. | 44×44 px minimum hit area for all tap targets on touch (`min-h-11` or padding). | M |
| DS12 | Focus | Inputs and buttons have focus rings; custom `<button>`s (filters, quick replies, eye toggle, release link, nav) mostly don't. *(verify)* | Medium | Keyboard users lose their place. | One `focus-visible` ring utility applied to every interactive element. | S |
| DS13 | Raw errors | Admin pages and Notifications show `'Could not …: ' + err.message` (raw Firebase text). `ClaimTag` shows `err.message` from Firestore too, if the transaction fails for a non-custom reason. | Medium | Technical text such as "Missing or insufficient permissions." | Route through `friendlyFirestoreError` everywhere; keep the raw message in `console`/`errorLog`. | S |
| DS14 | `index.html` | `theme-color` is `#0D0A1A` (dark) although the default theme is light. | Low | Dark browser bar over a light app on Android. | Set it from the active theme (`public/theme-init.js` already runs first). | S |

### A.2 Navigation and layout (NAV)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| NAV1 | Owner, mobile | Below `md` the only navigation is a hamburger drawer. The unread-notifications badge is **inside** the drawer, so on a phone the owner can't see that a finder reported their item without opening the menu. | Critical | The most important signal in the app is hidden on the device most owners use. | Mobile bottom tab bar for owners: Home, Items, Messages, Alerts (with badge). Settings + logout stay in a small menu. Also show the badge on the hamburger button until the bottom bar exists. | M |
| NAV2 | Owner | `NFC Setup` is a top-level nav item, but the page is useless without `?tagId=` (it only says "Open an item from My Items"). | High | A dead end in the main nav. | Remove it from the nav. Reach it from each item ("Edit tap page"). Rename the page to "Tap page" or "What people see". | S |
| NAV3 | Owner | Messages and Notifications overlap (both list report/message events and both link to chats). | Medium | Two places to check; unclear which is "the inbox". | Keep both routes, but make Messages the inbox (chats with unread state) and Notifications an activity log. Show one badge (unread chats) in nav. **Decided:** keep both pages this way. | M |
| NAV4 | Chat | `/chat/:id` is outside `DashboardLayout`, so the owner leaves the app shell (no nav) and has only a Back button. | Medium | Feels like leaving the app; hard to get to other items. | Keep the public route (finders need it). For owners, show a compact app bar with "Back to Messages" instead of the generic back button. No routing change needed. | S |
| NAV5 | Public pages | `TopNav` shows only a logo and a Back button. On the finder page "Back" goes to `/` (the owner marketing page) when there is no history. | Medium | A finder who taps Back lands on a page about signing up. | On `/nfc/:tagId` and finder chats, hide Back when there's no history, or label it clearly. | S |
| NAV6 | Admin | No active-page title in the mobile top bar; the logo is all you see. | Low | "Where am I?" on phones. | Show the current section name in the mobile top bar (both consoles). | S |
| NAV7 | Landing footer | "Admin console →" link on the public landing page. | Low | Confusing for normal users; invites probing. | **Decided:** replace with a small muted "Staff sign-in" link to `/admin/login` in the footer. | S |

### A.3 Dashboard (DB)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| DB1 | Dashboard | No title, no greeting, no primary action. First element is three stat tiles. | High | Doesn't answer "what do I do now?". | `PageHeader` "Hi, {name}" + primary action "Claim a tag" (or "Report lost" when the user has items). | S |
| DB2 | Dashboard | Stat tiles are not clickable. | Medium | Numbers without a next step. | Make each tile a link: Items tagged → Items; In lost mode → Items filtered to lost; Open reports → Messages (open). | S |
| DB3 | Incident card | Two badges say the same thing ("Report open", "Active found-item report"), plus a third "Lost status" outline badge that is not a status. The main action "Open chat →" is a small text link at the bottom. | High | The most important card on the page has the weakest CTA. | One `StatusBadge`, item name, map, last message, then a full-width **primary** "Reply to finder" button. | S |
| DB4 | Incident card | "No chat linked yet." gives no action. | Low | Dead end. | Link to Messages, or hide the line. | S |
| DB5 | Dashboard | A large "How your privacy is protected" card is always shown. | Low | Adds scroll; repeated on every visit. | Show it only when the owner has 0 items, or collapse to one line with "Learn more". | S |
| DB6 | Dashboard | No "recent activity". | Low | The owner has to open Notifications to see what changed. | Optional: last 3 notifications under incidents. Reuse the existing notifications context — no new query. | S |

### A.4 Authentication (AUTH)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| AUTH1 | Register | Name and Email inputs have no `autoComplete` (`name`, `email`). | Medium | No autofill on phones. | Add `autoComplete` and `inputMode="email"`. | S |
| AUTH2 | Register | The submit button is disabled while requirements are unmet but gives no reason at the button. | Medium | "Why can't I click?" | Keep the button enabled; on submit, focus the first unmet requirement and show the error next to the field (the check logic already exists). | S |
| AUTH3 | Login / Register | Error text sits between the fields and the button, not next to the field it belongs to. | Medium | Unclear which field is wrong. | Use `FormField` (DS6). Credential errors stay form-level, with `role="alert"`. | S |
| AUTH4 | `lib/utils.js` | `auth/weak-password` message says "at least 6 characters", but the app requires 8 + four character types. | Low | Contradicting messages. | Align the text with `PASSWORD_REQUIREMENTS`. | S |
| AUTH5 | Login | "Forgot password?" sends the reset right away using whatever is in the email field. | Low | A mistyped email sends nothing useful, with a success message. | Keep one-tap, but show the address in the success message ("Reset link sent to x@y"). | S |
| AUTH6 | Auth loading | `ProtectedRoute`, `AdminGate` and route fallback all show a bare "Loading…" on a full screen. | Low | Feels like a stall on slow networks. | Branded splash (logo + spinner) shared by all three. | S |
| AUTH7 | Register → Dashboard | After signup the owner lands on an empty dashboard with the verify-email toast. | Medium | No guidance on the first step. | First-run empty state on the Dashboard: 3 steps (Claim tag → Name the item → You're protected), primary "Claim your first tag". | S |

### A.5 NFC claim (NFC)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| NFC1 | Claim tag | Scanning is a button label change with a small spinner ("Hold your tag to the back of your device…"). No visual scanning state, **no Cancel**, no timeout. If nothing is tapped, the button stays disabled forever. | Critical | A user who can't find the NFC spot is stuck with a disabled button. | A scanning panel: phone+tag illustration/animation, short instruction, Cancel button (calls existing `stopScan`), and a 30 s timeout that returns to idle with a hint. | M |
| NFC2 | Claim tag | Before scanning there is no explanation of what will happen, or that NFC only works in Chrome on Android. | High | Users on iPhone see a small grey sentence and no alternative steps. | Two clear paths as cards: "Tap your tag" (when supported) and "Type the TagBack ID" (always). Explain where the ID is printed. | S |
| NFC3 | Claim tag | Success of a scan is silent: the ID field fills in, nothing else. | High | The user doesn't know the scan worked. | "Tag detected — TB-XXXX-XXXX" success state with a check icon; focus moves to Item name. | S |
| NFC4 | Claim tag | Failure messages are small red `text-xs`; `NotAllowedError` (NFC permission denied) isn't handled separately. | Medium | Weak recovery guidance. | Error panel with: NFC may be off (Settings → Connected devices → NFC), move phone closer, Try again, or type the ID. Separate text for permission denied. | S |
| NFC5 | Claim tag | The TagBack ID input uses `text-xs` monospace, no `autoCapitalize`, no format hint. | Medium | Hard to type on phones. | Normal size, `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}`, hint "Printed on the sticker, e.g. TB-ABCD-2345". Format error shown at the field. | S |
| NFC6 | Claim tag | Category defaults to "Luggage". | Low | Wrong default is saved silently. | No default: placeholder "Choose a category" and required, or default to a neutral "Other" if the list has one. | S |
| NFC7 | Claim tag | "Claim tag" button has no spinner (only text change). After success, the user goes to Items with only a toast. | Low | Minor inconsistency; next step unclear. | Spinner; after success land on Items with the new item highlighted and a hint "Turn on Lost Mode if it goes missing". | S |
| NFC8 | Finder landing (unclaimed) | "This tag isn't claimed yet" uses hand-made gradient link styles that differ from buttons elsewhere. | Low | Inconsistent. | Use the new `primary` button (DS1). | S |

### A.6 Items and Lost Mode (ITEM)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| ITEM1 | Items | "Report lost" is a small Switch labeled "Safe"/"Lost mode" at the card's right edge. It is the main action of the page, but has the least visual weight. | High | Owners in a stressful moment must find a small toggle. | Per-card primary button "Report lost" (opens the existing arm dialog). When lost: "Lost" status + "Mark as found" secondary button (opens the existing disarm dialog). The switch can stay for keyboard users only if needed; the business logic is unchanged. | M |
| ITEM2 | Items | Badges on one line: name + Lost + Found reported + Flagged + category. On 320–375 px this wraps or truncates the item name. *(verify)* | Medium | The item name — the most important text — gets cut. | Name on its own line; one `StatusBadge`; category as an icon + small text under the name. | S |
| ITEM3 | Items | "Release tag" is a grey text link next to "NFC profile", same size. | Medium | A permanent action sits next to a routine one. | Move Release into a "More" menu (`dropdown-menu.jsx` exists), in red, with the existing dialog. | S |
| ITEM4 | Items | The reward shows as `$` always (`Items.jsx` and the finder page `NfcLanding.jsx`). | Low | Wrong currency for local users. | **Decided:** Philippine peso. One `formatReward()` helper using `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })` (e.g. ₱40), used on both pages; label the arm-dialog field "Reward (₱, optional)". | S |
| ITEM5 | Arm dialog | No preview of what the finder will see. "Message to finder" has no character counter though it is capped at 500. | Medium | Owners write blind. | Counter (`123/500`) and a small preview line "Finders will see: …". | S |
| ITEM6 | Arm dialog | Confirm button is `destructive` (red) — arming Lost Mode is not destructive. | Low | Wrong signal. | Use `primary`; keep red for the Lost status itself. | S |
| ITEM7 | Items | The lifecycle is not visible: after a report there is only a "Found reported" badge, no link to the chat. | High | Owner can't jump from the item to the finder's message. | When an open report exists: "Reply to finder" link on the card (chat ID is available through the same data Dashboard uses). | S |
| ITEM8 | Items | Search box appears for 1 item. | Low | Noise. | Show search only when there are more than 5 items. | S |

### A.7 Finder experience (FIND)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| FIND1 | Finder landing | The page does not first say **what TagBack is**. A finder who has never heard of it sees "You found {item}" and a form. | High | Trust: "is this a scam?" | A short line under the logo: "This item is protected by TagBack. You can message the owner here — no app or account, and neither of you sees the other's contact details." | S |
| FIND2 | Finder landing | The form puts **location first** (left column on desktop, first on mobile), and the required message second. Two location inputs (button + note) look like two separate tasks. | High | The required field is below optional ones; more steps than needed. | Order: Message (required) → "Add location (optional)" as one collapsible block with the GPS button and the note → Primary "Send to owner". | S |
| FIND3 | Finder landing | Location permission is asked without saying who sees it and how precise it is (it is rounded to ~11 m and cleared on recovery, per ARCHITECTURE §5). | High | Location feels mysterious; people deny it. | Text next to the button: "Only the owner sees this. It's rounded to about 10 m and deleted when the item is returned." Denied → "Location is off. Type where you left it instead." and focus the note field. | S |
| FIND4 | Finder landing | Two privacy notes say nearly the same thing (in the card and at the bottom). | Low | Repetition. | Keep one (FIND1 line). | S |
| FIND5 | Finder landing | Loading is a bare spinner on a blank canvas (no background, no logo). | Medium | A stranger's first impression after a tap. | Branded loading shell with the TopNav and a card skeleton. | S |
| FIND6 | Finder landing | "Tag not recognized" gives no action. | Medium | Dead end. | Add "Try tapping again", and "Go to TagBack home". | S |
| FIND7 | After report | The finder is sent to the chat with no confirmation that the owner was notified, and no advice on how to come back later. The finder has no account; the chat link lives only in the URL/history. | Critical | Finders close the tab and can't return, so the owner's reply never reaches them. | On the first chat visit after a report, a success banner: "Sent. The owner has been notified." + "Keep this page open or save the link to see replies" + "Copy link" button. No data change. | S |
| FIND8 | Finder landing | Lost vs. not-lost pages differ only in badge and color. When not lost the heading still says "You found {item}". | Low | Minor. | Not lost: "This belongs to someone" + "If you found it, let the owner know." | S |

### A.8 Chat (CHAT)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| CHAT1 | Chat header | Back + title + subtitle + "Report" + "Mark as recovered" are on one row. At 320–375 px this overflows or squeezes the title. *(verify)* | High | The primary owner action may be pushed off screen. | Header: back, item name, status badge, and a "⋯" menu (Report). "Mark as recovered" moves to a sticky banner above the composer for owners. | M |
| CHAT2 | Chat | No per-message send state. After Send the input clears; the message appears only when the snapshot arrives. No "sending"/"sent"/"failed" marker. | High | On slow networks users re-send or think it failed. | Show pending bubbles from Firestore's local write (`hasPendingWrites` metadata) as "Sending…", then "Sent". On failure keep today's draft restore, and also mark the bubble "Not sent — Retry". Needs `useChatMessages` to expose snapshot metadata (read-only hook change). | M |
| CHAT3 | Chat | "You are the finder/owner" subtitle is technical; bubble colors are by **sender role** (owner always purple), not "mine vs. theirs". For a finder, their own messages are white and the owner's are purple. | Medium | Breaks the usual chat convention; confusing for finders. | Color by `mine` (already computed). Label the other side "Owner" or "Finder" in small text above their first bubble in a run. | S |
| CHAT4 | Chat | Relative timestamps only ("5m ago") in 10 px text; no day separators. | Low | Hard to follow a multi-day handoff. | 12 px timestamps; day separators ("Today", "Yesterday", date). | S |
| CHAT5 | Chat | Quick replies are the same for owner and finder, and include "Left at reception desk" for the owner. | Low | Odd suggestions. | Separate lists for owner and finder. | S |
| CHAT6 | Chat | Empty state "No messages yet. Say hello to get started." — but a finder chat always starts with the report text as `lastMessageText`, and the report message is not shown in the thread. **Confirmed — see BUG3.** | Critical | The finder's first message seems lost. | Show the report (message, location note, map for the owner) as a pinned first card in the thread. Data is already in `reports/{id}` for the owner; for the finder show their own text from `chat.lastMessageText` only if it came from the report. **Decided:** yes. | M |
| CHAT7 | Chat | Recovered state is a small green pill in the header only. | Medium | Both sides may keep going without knowing it's done. | Full-width banner: "Marked as recovered on {date}. You can still message to finish the handoff." | S |
| CHAT8 | Chat | Composer is an `Input` (single line), 36 px tall; no `enterKeyHint`. | Medium | Long messages are hard to write on phones. | Auto-growing `Textarea` (max 4 lines), `enterKeyHint="send"`, 44 px send button; Enter sends on desktop, newline on mobile. | S |
| CHAT9 | Chat | Loading shows "Loading conversation…" text, but the composer is usable during load and before the role check finishes (`send` silently returns while `!roleReady`). | Medium | Typed message may appear to do nothing. | Disable composer with "Connecting…" until `roleReady`. | S |
| CHAT10 | Chat | A chat ID that doesn't exist shows an empty chat with a working composer. *(verify)* | Medium | Confusing dead state. | "This conversation isn't available" state with a home link. | S |

### A.9 Recovery and release (REC)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| REC1 | Chat / Items / Dashboard | The lifecycle **Lost → Found reported → Chatting → Recovered** is not shown anywhere as one flow. Each screen shows a piece. | High | Owners don't know what step they are on or what comes next. | A small `StatusStepper` (4 steps) on the incident card and in the owner's chat header. Derived from data that exists: `isLostMode`, open report, chat, `chat.resolved`. No new fields. | M |
| REC2 | Recover dialog | "Mark as recovered" dialog says it turns off Lost Mode, but not that the report is closed and the finder's shared location is deleted (ARCHITECTURE §4/§5). | Medium | Unclear consequences. | State all three effects in the dialog text. | S |
| REC3 | Release | After releasing, the item vanishes from the list with only a toast. | Low | Momentary "did it work?" | Keep the toast; add "It can be claimed again with its TagBack ID". | S |
| REC4 | Recovered | No history of recovered incidents (known limitation noted in `Dashboard.jsx`). | Low | Owner can't look back. | Out of scope for this UI pass — needs a new list view. Note in docs only. | — |

### A.10 Other owner pages (OWN)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| OWN1 | NFC profile | First card shows technical fields: Physical UID, chip type, "Registered by admin (read-only)". | Medium | Implementation details on an owner page. | Show item name + TagBack ID only; put UID/chip under a "Technical details" disclosure. | S |
| OWN2 | NFC profile | Save button is at the bottom of a long form; no unsaved-changes warning. | Medium | Lost edits on navigation. | Sticky save bar on mobile when the form is dirty; `beforeunload` / router block when dirty. | M |
| OWN3 | Notifications | "Mark all as read" and "Clear read" sit next to the title and wrap on phones. *(verify)* | Low | Crowded header. | Move into a "⋯" menu on small screens. | S |
| OWN4 | Settings | "Delete my account" is an outline button with red text inside the Privacy card. | Low | Mixed with normal settings. | Separate "Danger zone" card at the bottom. | S |
| OWN5 | Settings | Disabled "Email alerts (coming soon)" switch. | Low | Shows a feature that doesn't exist. | Remove the switch; keep the one-line note. | S |

### A.11 Admin (ADM)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| ADM1 | Moderation | **Ban / unban a finder token runs with no confirmation**, and ban also notifies the owner. | High | One mis-click bans a finder and sends a notification. | `ConfirmDialog` for ban (and unban), stating the effects. | S |
| ADM2 | Errors | **"Clear all" deletes the whole error log with no confirmation.** | Medium | Irreversible data loss on a mis-click. | `ConfirmDialog`. | S |
| ADM3 | Admin tables | Tables scroll sideways on phones (`overflow-x-auto`); no card layout under `sm`. | Medium | Admin on a phone (needed for NFC Register) must scroll sideways. | Card-list layout below `sm` for Inventory, Moderation, Owners, Tag Content. | M |
| ADM4 | Admin | Raw `err.message` in toasts and inline errors (see DS13). | Medium | Technical errors. | `friendlyFirestoreError`. | S |
| ADM5 | Admin status | Tag status shows raw values: `registered`, `claimed`, `not_written`, `write_failed`. | Low | Reads like a database. | Map to labels + badge tones (Registered, Claimed, Not written, Write failed). | S |
| ADM6 | NFC Register | Scanning state is a large spinner "Waiting for NFC…" with Cancel — good — but no timeout. | Low | Same stuck state as NFC1. | Reuse the shared `NfcScanPanel` from NFC1. | S |
| ADM7 | Admin loading | Errors/Tag Content use text-only loading; others use skeleton rows. | Low | Inconsistent. | Skeleton rows everywhere. | S |

### A.12 Accessibility (A11Y)

| ID | Screen | Issue | Severity | UX impact | Recommended change | Cx |
|---|---|---|---|---|---|---|
| A11Y1 | All | Only 4 `aria-live`/`role` regions app-wide. Async results (claim errors, scan results, send failures) are not announced. | High | Screen-reader users don't hear results. | `role="alert"` for errors, `role="status"` for progress/success (via the shared state components). Sonner toasts are already announced. | S |
| A11Y2 | All | `text-slate-400` on light glass is used for helper text and timestamps. Its contrast on white is about 2.6:1. *(verify with the contrast script used for index.css)* | Medium | Hard to read for many users. | Use `text-slate-500` (≈4.8:1) as the minimum for any text. | S |
| A11Y3 | Status | Unread markers are an 8 px purple dot (with sr-only text — good), lost status relies heavily on red. | Medium | Color-only for sighted color-blind users. | Pair every status color with an icon and a word (StatusBadge). Unread rows: bold title + dot. | S |
| A11Y4 | Dialogs | Radix dialogs trap focus correctly. Destructive dialogs already `autoFocus` Cancel — keep. | — | — | Keep; make it the `ConfirmDialog` default. | — |
| A11Y5 | Page titles | `document.title` is set only on the finder page. | Low | Tabs and screen readers can't tell pages apart. | Set title in `PageHeader`. | S |
| A11Y6 | Skip link | No "Skip to content" link past the sidebar. | Low | Keyboard users tab through nav on every page. | Add to both layouts. | S |

---

## B. Design system proposal

Build on the existing tokens in `src/index.css` and `tailwind.config.js`.
Nothing here changes the brand colors or the neumorphic/glass split.

### B.1 Colors (semantic roles)

Existing tokens stay. Add the missing **state** tokens so pages stop using
raw `emerald-600`, `amber-600`, `red-600`, `rose-600`:

| Role | Token (new unless noted) | Light | Use |
|---|---|---|---|
| Primary | `--primary` (exists) | brand purple | Primary buttons, links, focus ring |
| Accent | `--accent` (exists) | signal pink | Gradient end only; never on its own for text |
| Success | `--success` / `--success-foreground` | emerald 600 / white | Recovered, saved, verified |
| Warning | `--warning` / `--warning-foreground` | amber 600 / dark ink | Stale lost item, unverified email, admin edit notice |
| Danger | `--destructive` (exists) | red 600 | Lost status, destructive actions, errors |
| Info | `--info` / `--info-foreground` | sky 600 / white | Found reported, neutral notices |
| Neutral | `--muted` / `--muted-foreground` (exist) | — | Secondary text, disabled |

Each role also gets a `-soft` background (e.g. `--success-soft`) for badges
and banners. Keep the "lost = red, moderation = rose" rule from
`index.css`. Check every new pair with the same contrast script noted in
`index.css` (4.5:1 text, 3:1 UI).

### B.2 Typography

Inter stays. One scale:

| Style | Class | Use |
|---|---|---|
| Page title | `text-2xl font-extrabold` (sm: `text-3xl`) | One per page, in `PageHeader` |
| Section heading | `text-lg font-bold` | Card groups |
| Card title | `text-base font-semibold` | Card headers, item names |
| Body | `text-sm` (mobile inputs stay `text-base` to stop iOS zoom) | Default copy |
| Helper | `text-sm text-muted-foreground` | Field hints, descriptions |
| Caption | `text-xs text-muted-foreground` | Timestamps, meta — minimum size |
| Label | `text-sm font-medium` | Form labels |
| Error | `text-sm text-destructive` + icon | Field and form errors |
| Success | `text-sm text-success` + icon | Inline confirmations |

Remove `text-[10px]` and `text-[11px]`. Use `uppercase tracking-wide` only
for small section eyebrows, at most one per card.

### B.3 Spacing

Tailwind's 4 px scale, limited to: `1, 1.5, 2, 3, 4, 6, 8, 12`.
- Page gutter: `px-4` mobile, `px-8` from `sm`.
- Card padding: `p-4` mobile, `p-6` from `sm`.
- Stack gap inside a card: `gap-4`; between cards: `space-y-4` (lists) or
  `space-y-6` (page sections).
- Form field gap: label→control `1.5`, field→field `4`.

### B.4 Radii

| Element | Radius |
|---|---|
| Buttons, badges, pills, chips | `rounded-full` (as today) |
| Inputs, selects, small panels | `rounded-xl` |
| Cards, dialogs, sheets | `rounded-3xl` (one value; drop `rounded-2xl` cards) |
| Chat bubbles | `rounded-2xl` |

### B.5 Shadows

Keep the four `shadow-neu-*` values. Rules:
- `neu-flat`: nav rails, primary floating controls only.
- `neu-flat-sm`: buttons, chips.
- `neu-pressed(-sm)`: inputs, active nav item, pressed state.
- Glass cards: `shadow-lg` → reduce to a softer custom `shadow-card`
  (`0 8px 24px -12px rgba(30,41,59,.18)`).
- No glow shadows except the one-time lost-state highlight (DS9).

### B.6 Buttons

| Variant | Look | Use |
|---|---|---|
| `primary` (new) | Brand gradient fill, white text, `neu-flat-sm` | One per screen/section |
| `secondary` (today's `default`) | `bg-base` neumorphic, gradient text | Other actions |
| `outline` | as today | Tertiary, filters |
| `ghost` | as today | Cancel, icon buttons |
| `destructive` | as today | Irreversible actions only |
| `success` (new) | emerald fill | "Mark as recovered" |
| `link` | as today | Inline text links |

Sizes: `sm` 36 px, `default` 44 px, `lg` 48 px. Icon buttons 44 px on
touch. Every button supports a `loading` prop: shows a spinner, keeps its
width, sets `aria-busy`, and is disabled. Changing the default variant
changes every existing button, so do it in one step with a sweep of all
`<Button>` call sites (see D, step 2).

### B.7 Status badges

One `StatusBadge` with a fixed map. States are derived from existing data —
**no schema change**:

| State | Derived from | Label | Tone | Icon |
|---|---|---|---|---|
| `safe` | `!isLostMode` and no open report | Protected | success-soft | ShieldCheck |
| `lost` | `isLostMode` and no open report | Lost | danger-soft | AlertTriangle |
| `found` | open `reports` doc on the tag | Found — report open | info-soft | PackageSearch |
| `recovered` | chat `resolved: true` | Recovered | success-soft | CheckCircle2 |
| `flagged` | `tagStatus === 'blacklisted'` | Flagged by admin | rose-soft | ShieldAlert |
| `reported` | chat `blocked` / reported | Under review | warning-soft | Flag |

"Released" is not a visible state: a released tag is no longer the owner's,
so it leaves their lists. Chat-level states: `open`, `recovered`,
`under review`.

Admin states use the same component with an `admin` map: Registered,
Claimed, Blacklisted, Not written, Written, Write failed.

### B.8 Inputs and forms

- `FormField` wrapper (DS6).
- Heights: 44 px on touch.
- Right `type`, `inputMode`, `autoComplete`, `autoCapitalize`,
  `enterKeyHint` on every field.
- Character counters on capped textareas (lost message 500, finder message
  500, chat 1000).
- Required: mark optional fields "(optional)" instead of marking required
  ones with `*` — most fields in this app are required.
- Validate on submit, then live on change for fields that already showed
  an error.

### B.9 States

| Component | Props | Replaces |
|---|---|---|
| `LoadingState` | `variant: page \| inline \| section`, `label` | The 8+ copies of `<Loader2/> Loading…` |
| `Skeleton` presets | `SkeletonCard`, `SkeletonRow`, `SkeletonList(n)` | Hand-sized skeletons |
| `EmptyState` | `icon`, `title`, `description`, `action` | Hand-built empty cards |
| `ErrorState` | `title`, `description`, `onRetry`, `action` | Bare red text / blank pages |
| `InlineAlert` | `tone`, `title`, `children`, `role` | Amber/red/emerald notice boxes |
| `ConfirmDialog` | see DS7 | Copy-pasted dialogs |
| Toasts | Sonner (exists) | Keep; success for routine actions, errors that need no action |

Offline: a small top banner when `navigator.onLine` is false ("You're
offline — changes will send when you reconnect"). Firestore already queues
writes; this only tells the user.

### B.10 Dialogs and sheets

- Desktop: centered dialog (as today).
- Below `sm`: dialogs open as a **bottom sheet** (`sheet.jsx` with
  `side="bottom"`), buttons full width, primary last (bottom) so it's in
  thumb reach.
- Destructive dialogs: Cancel is focused by default (already the case).

### B.11 Motion

- 150–200 ms ease-out for hover/press, 250 ms for panels and sheets.
- Allowed: button press, sheet/dialog enter, status change (one-time),
  NFC scanning ring, message "sent" tick.
- Remove: `pulseGlow` loop (DS9). Ambient background stays static (already).
- `prefers-reduced-motion`: already global in `index.css` — keep.

### B.12 Responsive rules

- Mobile first. Breakpoints stay Tailwind defaults (`sm` 640, `md` 768,
  `lg` 1024, `xl` 1280).
- Owner shell: bottom tab bar below `md`, sidebar from `md`.
- Admin shell: drawer below `md` (as today), sidebar from `md`.
- Tables become card lists below `sm`.
- Max content width: 42 rem for forms and single-column pages, 64 rem for
  dashboards and lists.
- No horizontal page scroll at 320 px; long IDs (`TB-XXXX-XXXX`, URLs) use
  `break-all` or truncate with a copy button.
- Respect safe areas (`viewport-fit=cover` is already set): bottom bar and
  chat composer use `pb-[env(safe-area-inset-bottom)]`.

---

## C. Screen-by-screen plan

Each screen: problem → change → benefit → components touched. Audit IDs in
brackets.

### C.1 App shell and navigation
- **Problem:** mobile owners can't see alerts; NFC Setup is a dead-end nav
  item; no page titles. [NAV1, NAV2, DS4, NAV6]
- **Change:** owner bottom tab bar (Home, Items, Messages, Alerts with
  badge); drop NFC Setup from nav; `PageHeader` on every page; section name
  in mobile top bars; skip link.
- **Benefit:** the "someone found your item" signal is always visible;
  users always know where they are.
- **Components:** `nav/SidebarShell.jsx`, `nav/DashboardSidebar.jsx`, new
  `nav/BottomTabBar.jsx`, new `PageHeader.jsx`, `DashboardLayout.jsx`,
  `admin/AdminLayout.jsx`.

### C.2 Landing (`/`)
- **Problem:** fine overall; primary CTA is the weak default button; admin
  link in the footer. [DS1, NAV7]
- **Change:** `primary` "Create account", `secondary` "Sign in"; a "Found
  something?" card that says "Tap the tag with your phone" with a simple
  illustration; staff link made quiet.
- **Benefit:** clearer entry for both owners and curious finders.
- **Components:** `pages/Landing.jsx`.

### C.3 Register / Login
- **Problem:** no autofill hints on some fields; errors not tied to fields;
  disabled submit with no reason; bare loading screens. [AUTH1–AUTH6]
- **Change:** `FormField`; autocomplete/inputMode; enabled submit with
  focused error; branded auth splash. Keep the password checklist exactly.
- **Benefit:** faster signup on phones; no guessing about errors.
- **Components:** `components/SignupForm.jsx`, `pages/auth/Login.jsx`,
  `pages/admin/AdminLogin.jsx`, `components/ProtectedRoute.jsx`,
  `lib/utils.js` (message text only).

### C.4 Dashboard
- **Problem:** no title or primary action; incident card has duplicate
  badges and a weak CTA; privacy card always shown. [DB1–DB6, AUTH7]
- **Change:** greeting + primary action; clickable stat tiles; incident card
  = `StatusBadge` + `StatusStepper` + map + last message + primary "Reply to
  finder"; first-run steps when the owner has 0 items; privacy card only on
  first run.
- **Benefit:** the dashboard answers "what now?" in one glance.
- **Components:** `pages/dashboard/Dashboard.jsx`, new `StatusBadge`,
  `StatusStepper`, `EmptyState`.

### C.5 Claim tag
- **Problem:** stuck scanning state with no cancel/timeout; no explanation;
  silent success; weak error recovery; hard-to-type ID. [NFC1–NFC7]
- **Change:** two-path layout ("Tap your tag" / "Type the TagBack ID");
  shared `NfcScanPanel` with idle → scanning (animated ring, Cancel, 30 s
  timeout) → detected → error states; ID field fixes; category without a
  wrong default; highlight the new item after claim.
- **Benefit:** the most important onboarding step can't dead-end.
- **Components:** `pages/dashboard/ClaimTag.jsx` (UI only — the
  `runTransaction` block and `scanNfc` reader logic stay as they are), new
  `components/NfcScanPanel.jsx`.

### C.6 My Items
- **Problem:** "Report lost" is a small switch; badges crowd the name;
  Release sits next to a routine link; no path from item to chat.
  [ITEM1–ITEM8]
- **Change:** item card = name, `StatusBadge`, category, tap count; primary
  button by state ("Report lost" / "Reply to finder" / "Mark as found");
  "More" menu with "Edit tap page" and red "Release tag"; arm dialog with
  counter, preview and `primary` confirm.
- **Benefit:** the owner's key action is one obvious tap.
- **Components:** `pages/dashboard/Items.jsx`. Calls to `toggleLostMode`,
  `releaseTag`, `getTagScanCount` unchanged.

### C.7 Tap page editor (`/dashboard/nfc-setup`)
- **Problem:** technical fields up front; save at the bottom; no dirty-state
  warning. [OWN1, OWN2, NAV2]
- **Change:** rename to "Tap page"; header with item name + "Preview";
  technical details collapsed; sticky save bar when dirty; unsaved-changes
  guard.
- **Components:** `pages/dashboard/NfcSetup.jsx`,
  `components/TagContent.jsx` (layout only; `validateProfile`/
  `formToProfile` unchanged).

### C.8 Finder landing (`/nfc/:tagId`)
- **Problem:** no "what is this" line; location before the required
  message; unexplained location permission; duplicate privacy notes; bare
  loading; dead-end not-found. [FIND1–FIND6, FIND8]
- **Change:** order = trust line → item + owner message (+ reward) →
  message field → optional location block with a clear privacy line →
  primary "Send to owner". Branded loading; actions on not-found.
- **Benefit:** a stranger understands the page and sends a report in under
  a minute, with no fear about their data.
- **Components:** `pages/public/NfcLanding.jsx` (the `submitReport` writes
  and the landing resolution in `useEffect` stay as they are).

### C.9 Chat (`/chat/:chatId`)
- **Problem:** crowded header; no message states; role-colored bubbles;
  single-line composer; composer usable before role is known; no recovered
  banner; report text not in the thread. [CHAT1–CHAT10, FIND7, NAV4]
- **Change:** compact header with status + "⋯" menu; owner action banner
  ("Got it back? Mark as recovered"); "mine/theirs" bubbles with side
  labels; Sending/Sent/Not sent + Retry; day separators; growing composer
  with safe-area padding; "Connecting…" until `roleReady`; not-found state;
  finder first-visit banner with "Copy link".
- **Benefit:** both sides always know whether a message went through and
  what step they are on; finders can come back.
- **Components:** `pages/public/Chat.jsx`; `lib/ownerItems.js#useChatMessages`
  only to expose `hasPendingWrites` (read-side, no write change).

### C.10 Recovery and release
- **Problem:** no single view of the lifecycle; recover dialog omits
  effects. [REC1–REC3]
- **Change:** `StatusStepper` (Lost → Found → Talking → Recovered) on the
  incident card and in the owner's chat; full effects in the recover
  dialog; clearer release confirmation copy.
- **Components:** new `StatusStepper.jsx`, `Chat.jsx`, `Dashboard.jsx`,
  `Items.jsx`.

### C.11 Messages and Notifications
- **Problem:** overlapping purpose; crowded header actions on mobile;
  small unread dot. [NAV3, OWN3, A11Y3]
- **Change:** Messages as inbox with unread rows in bold + dot + `StatusBadge`;
  Notifications as activity log; header actions in a "⋯" menu on phones.
- **Components:** `pages/dashboard/Messages.jsx`,
  `pages/dashboard/Notifications.jsx`, `context/OwnerNotificationsContext.jsx`
  (read-only use).

### C.12 Settings
- **Problem:** delete account mixed with privacy link; fake email-alerts
  switch. [OWN4, OWN5]
- **Change:** sections Appearance / Account / Privacy / Danger zone; remove
  the disabled switch.
- **Components:** `pages/dashboard/Settings.jsx` (`deleteMyAccount` flow
  unchanged).

### C.13 Admin console
- **Problem:** ban and clear-log with no confirmation; sideways tables on
  phones; raw error text and raw status values; mixed loading styles.
  [ADM1–ADM7]
- **Change:** `ConfirmDialog` for ban/unban and clear log; card lists under
  `sm`; friendly errors; `StatusBadge` admin map; shared `NfcScanPanel` on
  NFC Register; skeleton rows.
- **Components:** `pages/admin/Moderation.jsx`, `Errors.jsx`,
  `Inventory.jsx`, `Owners.jsx`, `TagContentIndex.jsx`, `TagContent.jsx`,
  `NfcRegister.jsx` (UI only — register/write transactions unchanged).

### C.14 Privacy page
- **Problem:** not audited in depth; long text. *(verify)*
- **Change:** headings + short summary at the top ("What we store / Who
  sees it / How to delete it"). Content unchanged.
- **Components:** `pages/Privacy.jsx`.

---

## D. Implementation order

Ordered to keep each step small, testable and reversible. Run `npm run
build` and `npm test` after every step; the rules/flow tests must all keep passing.
Only step 0 touches logic, and no step changes `firestore.rules`.

0. **Reported bugs (section 0), in this order:** BUG2 (invisible button
   text) → BUG3 (finder's first message missing from the chat) → BUG1
   (category icon) → BUG4 (wrong-browser read-only state) → BUG6 (location
   fallback and reasons) → BUG5 (listener errors, retry, "Connecting…") →
   BUG7/BUG8 (chat header, finder form order). Test each on a real Android
   phone, in Chrome **and** in Messenger's in-app browser. *Risk: low. BUG3
   adds one write the rules already allow; add it to `tests/flows.test.js`.*

1. **Foundations, no visual change yet.** Add state tokens (B.1) to
   `index.css` / `tailwind.config.js`. Add new components unused:
   `PageHeader`, `StatusBadge`, `StatusStepper`, `EmptyState`,
   `ErrorState`, `LoadingState`, `InlineAlert`, `FormField`,
   `ConfirmDialog`, `NfcScanPanel`. *Risk: none — nothing imports them yet.*
2. **Button variants.** Add `primary`, `success`, `loading`; rename today's
   default look to `secondary`; sweep every `<Button>` call site and pick
   the right variant; remove one-off gradient/emerald class overrides
   [DS1]. *Risk: visual only; review each page.*
3. **Critical fixes** (small, high value): NFC scan cancel + timeout
   [NFC1], finder "report sent / save link" banner [FIND7], admin ban and
   clear-log confirmations [ADM1, ADM2], raw error text [DS13, ADM4].
4. **Shell + navigation:** owner bottom tab bar with badge [NAV1], drop NFC
   Setup from nav [NAV2], `PageHeader` on every page [DS4], skip link.
5. **Owner flows, in workflow order:** Register/Login [AUTH] → Claim [NFC]
   → Items [ITEM] → Dashboard [DB] → Tap page [OWN1–2].
6. **Finder + chat + recovery:** Finder landing [FIND] → Chat [CHAT] →
   Recovery stepper and dialogs [REC].
7. **Messages, Notifications, Settings** [NAV3, OWN3–5].
8. **Admin** [ADM3, ADM5–7].
9. **States sweep:** replace remaining hand-made loading/empty/error blocks
   with the shared components; offline banner [DS5, B.9].
10. **Mobile + accessibility pass** at all widths in G; fix *(verify)* items;
    contrast check [A11Y, DS10–DS12].
11. **Visual polish:** radii, spacing, card shadows, remove `pulseGlow`,
    skeleton color, theme-color [DS2, DS8, DS9, DS14].
12. **Docs:** update `LIGHT_NEUMORPHIC_REDESIGN_PLAN.md` (new tokens and
    components), `ARCHITECTURE.md` §2 if a component layer is added, and
    this file's status.

Suggested commit shape: one commit per step or per screen, message citing
the IDs (e.g. "UI_UX_IMPROVEMENT_PLAN.md NFC1–NFC5: claim tag scan states").

---

## E. Files to modify

**Styles and config**
- `src/index.css` — state tokens, `.glass` shadow, focus utility.
- `tailwind.config.js` — map new tokens; `shadow-card`; drop `pulseGlow` use.
- `index.html` / `public/theme-init.js` — theme-color per theme [DS14].

**UI primitives** (`src/components/ui/`)
- `button.jsx` — variants, sizes, `loading` [DS1, DS11].
- `select.jsx` — value slot as a flex row [BUG1].
- `badge.jsx` — tone variants for `StatusBadge`.
- `skeleton.jsx` — neutral color [DS8].
- `input.jsx`, `textarea.jsx` — 44 px height, error styling.
- `dialog.jsx` / `sheet.jsx` — bottom-sheet behavior on mobile [B.10].

**Shared components** (`src/components/`)
- `GlassCard.jsx` — single glass surface with tones; remove pulse [DS2, DS9].
- `BackButton.jsx` — hide/label when no history [NAV5].
- `ProtectedRoute.jsx`, `RouteErrorBoundary.jsx` — branded loading/error.
- `SignupForm.jsx` — `FormField`, autocomplete, submit behavior [AUTH].
- `TagContent.jsx` — layout only [OWN1].
- `ReportLocationMap.jsx` — caption + a11y label only.
- `nav/SidebarShell.jsx`, `nav/DashboardSidebar.jsx`, `nav/AdminSidebar.jsx`,
  `nav/TopNav.jsx` [NAV].
- **New:** `PageHeader.jsx`, `StatusBadge.jsx`, `StatusStepper.jsx`,
  `EmptyState.jsx`, `ErrorState.jsx`, `LoadingState.jsx`, `InlineAlert.jsx`,
  `FormField.jsx`, `ConfirmDialog.jsx`, `NfcScanPanel.jsx`,
  `nav/BottomTabBar.jsx`, `OfflineBanner.jsx`.

**Pages**
- `src/pages/Landing.jsx`, `src/pages/Privacy.jsx`
- `src/pages/auth/Login.jsx`, `src/pages/auth/Register.jsx`
- `src/pages/dashboard/DashboardLayout.jsx`, `Dashboard.jsx`, `Items.jsx`,
  `ClaimTag.jsx`, `NfcSetup.jsx`, `Messages.jsx`, `Notifications.jsx`,
  `Settings.jsx`
- `src/pages/public/NfcLanding.jsx`, `src/pages/public/Chat.jsx`
- `src/pages/admin/AdminLayout.jsx`, `AdminLogin.jsx`, `AdminRegister.jsx`,
  `Inventory.jsx`, `NfcRegister.jsx`, `Moderation.jsx`, `Owners.jsx`,
  `TagContent.jsx`, `TagContentIndex.jsx`, `Errors.jsx`

**Bug fixes (section 0)**
- `src/pages/public/NfcLanding.jsx` — first chat message [BUG3], button variant [BUG2], form order [BUG8].
- `src/pages/public/Chat.jsx` — button variants [BUG2], wrong-browser state [BUG4], Connecting/Retry [BUG5], header [BUG7].
- `src/lib/ownerItems.js` — listener error callbacks report the error instead of dropping it [BUG5].
- `src/lib/geolocation.js` — timeout, fallback, failure reason [BUG6].
- `tests/flows.test.js` — first-message step [BUG3].

**Library (narrow, read-side or text only)**
- `src/lib/utils.js` — error message text [AUTH4]; no logic change to
  `friendlyAuthError`/`friendlyFirestoreError` signatures.
- `src/lib/ownerItems.js` — **only** `useChatMessages`, to also return
  `hasPendingWrites` per message [CHAT2]. No change to any write function.

**Docs**
- `docs/LIGHT_NEUMORPHIC_REDESIGN_PLAN.md`, `ARCHITECTURE.md` (§2 if
  needed), `docs/README.md`, this file.

---

## F. Files that should not change

These hold business logic, security or architecture. Leave them alone
unless a separate, explicit task says otherwise.

| File | Why |
|---|---|
| `firestore.rules` | The security boundary. A UI pass has no reason to touch it. |
| `firestore.indexes.json`, `firebase.json`, `.firebaserc` | Deploy, indexes, headers. |
| `src/firebase/config.js` | Firebase init and `firebaseReady`. Only BUG5's long-polling option, and only if the Messenger test confirms it and the owner approves. |
| `src/context/AuthContext.jsx` | Profile repair, disabled-account sign-out. |
| `src/lib/adminAuth.js` | Mirrors the rules' `isAdmin()`. |
| `src/lib/account.js` | Account deletion order. |
| `src/lib/tags.js` | TagBack ID format and NDEF parsing. |
| `src/lib/tagContent.js` | `resolveLanding`, validation, admin-managed rule. |
| `src/lib/moderation.js`, `src/lib/adminOwners.js` | Admin data operations. |
| `src/lib/finderSession.js` | Finder identity token. |
| `src/lib/geolocation.js` | Location capture (rounding is part of privacy). **Exception:** BUG6 (timeout, fallback, reason) — the rounding stays exactly as is. |
| `src/lib/errorLog.js` | Rate-limited crash reporting. |
| `src/lib/ownerItems.js` | All owner reads/writes, claim/release/recover transactions — **except** the one read-side hook change in E. |
| Transaction and NFC reader code **inside** `ClaimTag.jsx`, `NfcRegister.jsx`, `NfcLanding.jsx#submitReport`, `Chat.jsx#send/confirmRecovered/confirmBlock` | Change the JSX around them, not the calls. **Exception:** BUG3 adds one first-message write after the chat is created in `NfcLanding.jsx#submitReport`; BUG4 adds a read-only role check in `Chat.jsx`. |
| `tests/*`, `scripts/*`, `.github/workflows/ci.yml` | Tests and ops. They must keep passing. **Exception:** add the BUG3 first-message step to `tests/flows.test.js`. |
| `src/App.jsx` routes | Keep every path as is. Only the fallback component may change. |

---

## G. Testing checklist

### Automated (every step)
- `npm run build` — clean.
- `npm test` — all pass (rules + flows). Any failure means a non-UI change
  slipped in.

### Reported bugs (section 0) — on a real Android phone, Chrome and Messenger in-app browser
- [ ] BUG1: category field shows icon and name on one line.
- [ ] BUG2: text visible on the red Report button, green Mark as recovered
      and Confirm buttons, and the Claim this tag button.
- [ ] BUG3: the finder's report message is the first message in the chat,
      for both finder and owner.
- [ ] BUG4: open a finder's chat link in a second browser → read-only notice,
      no composer; owner signed out → "Sign in" prompt.
- [ ] BUG5: switch apps for 2+ minutes, come back → new messages appear, or
      an error with Retry shows.
- [ ] BUG6: location indoors, location denied, location in Messenger → each
      gives a clear message; the report still sends.
- [ ] BUG7: chat header fits at 320 and 375 px.

### Functional (manual, live Firebase and preview mode)
- [ ] Register (all password rules), login, logout, password reset.
- [ ] Claim by typing an ID; by NFC tap (Chrome on Android); cancel a scan;
      let a scan time out; tap a non-TagBack tag; deny NFC permission.
- [ ] Claim from an unclaimed tag tap (signed out → login → claim).
- [ ] Report lost (with/without reward), edit, mark as found.
- [ ] Finder: open tag, send report with and without location, deny
      location, see the "sent" banner, copy the link, return via link.
- [ ] Owner receives badge on mobile bottom bar; opens chat from Dashboard,
      Items, Messages and Notifications.
- [ ] Chat both directions; send on slow 3G (DevTools) and offline — see
      Sending / Not sent / Retry; report chat from each side.
- [ ] Mark as recovered; release a tag; delete account.
- [ ] Admin: register + write a tag, cancel scan, blacklist/unblacklist,
      ban/unban (with confirm), mark reviewed, disable owner, clear error
      log (with confirm), tag content bulk apply.

### UI states (each screen)
- [ ] Loading (skeleton or branded), empty, error with retry, success
      feedback, disabled with reason, validation at the field, confirmation
      for irreversible actions, offline banner.

### Responsive
- [ ] 320, 375, 390, 430 px; 768 px; 1024, 1280, 1440+ px.
- [ ] No horizontal scroll; long IDs/URLs wrap; bottom bar and chat composer
      clear the home indicator; dialogs become bottom sheets on phones.
- [ ] Admin tables become cards under `sm`.

### Accessibility
- [ ] Keyboard only: every action reachable, visible focus, skip link, Esc
      closes dialogs, focus returns to the trigger.
- [ ] Screen reader (TalkBack + NVDA or VoiceOver): page titles, field
      errors announced, scan and send results announced, icon buttons named.
- [ ] Contrast: all text ≥ 4.5:1, UI ≥ 3:1, in light and dark.
- [ ] Status never shown by color alone.
- [ ] Reduced motion: no animation.
- [ ] Touch targets ≥ 44 px.

### First-time-user check (per major screen)
Purpose obvious? Next action obvious? One primary action? Progress visible?
Success confirmed? Error recoverable? Comfortable on a phone? Trustworthy?
Privacy clear? Consistent with the rest?

---

## H. Rules for the implementation

1. Read a file and its callers before changing it.
2. Change JSX and styles; don't change Firestore calls, transactions, rules
   or the data model. If a UI change seems to need a data change, stop and
   record it here as a decision instead.
3. Prefer small targeted edits and the shared components over rewrites.
4. No new dependencies unless a gap can't be filled with what's installed
   (Radix, lucide, sonner, tailwindcss-animate cover everything above).
5. No mock data in live paths; keep the `firebaseReady` preview behavior.
6. Keep code comments that cite older plan docs; add new ones in the same
   style ("UI_UX_IMPROVEMENT_PLAN.md NFC1").
7. Update docs when a component layer or design token changes.

### Decisions (2026-09-28)
- **NAV3:** keep Messages and Notifications as two pages. Messages is the
  inbox; Notifications is the activity log; one nav badge (unread chats).
- **ITEM4:** show rewards in Philippine pesos (₱), formatted with
  `Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })`. Display only: the
  stored `rewardAmount` stays a plain number.
- **CHAT6:** yes. Show the finder's original report as a pinned first card
  in the chat thread. Now also BUG3: the report message becomes the first
  chat message.

- **NAV7:** replace the landing footer's "Admin console →" with a small,
  muted "Staff sign-in" link to `/admin/login`. It isn't hidden, because
  security comes from the rules, not the link. It no longer invites regular
  users into the console, and staff can still find it during demos.
- **BUG5:** long polling is on for in-app browsers now, before the phone
  test (owner's call, 2026-09-28). If the Messenger test shows no problem,
  it can stay; it only affects in-app browsers.

---

## Implementation status (2026-09-28)

All of sections 0 and A–C are implemented in code, in the order of D.
Nothing has been checked in a real browser or on a phone yet — the
checklist in G is still to do. `npm run build` passes; `npm test` passes.

**New shared components** (`src/components/`): `PageHeader`,
`StatusBadge` (+ `itemStatus()`), `StatusStepper` (+ `recoveryStep()`),
`States` (`LoadingState`, `SkeletonList`, `EmptyState`, `ErrorState`,
`InlineAlert`), `FormField` (+ `FormError`), `ConfirmDialog`,
`NfcScanPanel`, `OfflineBanner`, `nav/BottomTabBar`. New helpers:
`lib/pageTitle.js`, `lib/inAppBrowser.js`, `formatReward()` in
`lib/utils.js`.

**Design tokens:** `success` / `warning` / `info` (+ `-soft`) and
`destructive-soft` in `index.css` and `tailwind.config.js` (contrast
checked: ≥ 5.3:1 light, ≥ 5.8:1 dark); `shadow-card` on every content
card (`shadow-lg` stays only on dialogs, menus and sheets); a global
`:focus-visible` ring; `.stack-table` (admin tables as cards below `sm`).

**Button:** new `primary` and `success` variants and a `loading` prop;
sizes are now 44 px by default (`sm` 36 px). The old `default` look stays
as is (not renamed to `secondary`, to avoid touching every call site); the
main action on each screen uses `primary`.

**Data changes (all read-side, no rules change):** the notifications
context also shares the owner's chats listener (one listener instead of
one per page); `useChatMessages` reports `pending` per message; chat and
list listeners re-subscribe after being offline or in the background.

**Not done / partly done:**
- DS2: `Chat.jsx` and `NfcLanding.jsx` still have their own `GLASS`
  constant (owner pages use `GlassCard`).
- DS6: `FormField` is used on auth, claim, Lost Mode, settings and admin
  sign-in forms; the shared tag-content form (`TagContent.jsx`) and admin
  passcode card keep their own labels.
- REC4 (history of recovered items): out of scope, needs a new list view.
- G: the manual browser/phone/accessibility checks.
