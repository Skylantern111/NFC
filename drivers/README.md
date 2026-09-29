# TagBack browser drivers

Two separate drivers, one per role. They open the real app in Chrome and
click through it like a person would.

```text
USER DRIVER  (user-driver.js)            ADMIN DRIVER  (admin-driver.js)
   normal TagBack owner                     TagBack administrator
   owner console  /dashboard/*              admin console  /admin/*
   claim → items → Lost Mode →              NFC register → inventory →
   reports → chat → recovery → release      blacklist → moderation →
                                            owners → error log → settings
```

| File | What it is |
|---|---|
| `user-driver.js` | Owner workflows only |
| `admin-driver.js` | Admin workflows only |
| `driver-config.js` | Shared, role-neutral settings: mode, app URL, timeouts, viewports, Chrome path |
| `browser.js` | Shared, role-neutral browser helpers (Chrome over the DevTools Protocol, clicks, waits, screenshots, step runner) |
| `drivers.env.example` | Template for `drivers/.env.drivers` (git-ignored) |
| `output/` | Failure screenshots (git-ignored) |

No extra packages: the drivers use Node 24's built-in `WebSocket` and
`fetch` to drive a local Chrome.

## How to run

```bash
npm run drivers:user     # = node drivers/user-driver.js
npm run drivers:admin    # = node drivers/admin-driver.js
```

Each exits with code 0 when nothing failed, 1 otherwise. Output looks like:

```text
[USER] Starting user driver — mode: preview
[USER] Dashboard (/dashboard)
[USER]   ✓ state: Action needed
[USER] ✗ FAIL — My Items
[USER]   driver:   user-driver.js
[USER]   page:     /dashboard/items
[USER]   expected: …
[USER]   actual:   …
[USER]   screenshot: drivers/output/user-08-my-items.png
```

A failed sign-in stops that driver (every later step needs it). Other
failures are recorded and the driver continues.

## Modes

### Preview (default) — safe
The driver starts its own Vite dev server with the Firebase variables
blanked, so the app runs on mock data and **can't reach any real project**.
Nothing is read or written.

Limits of preview mode (the app's own behavior, `firebaseReady === false`):
- there is no sign-in, and the route guards (`ProtectedRoute`, `AdminGate`)
  let every page render — so **role separation can't be tested here**;
- data is mock data and resets on every page load;
- owner-only chat controls (Mark as recovered) don't render — the preview
  chat treats the viewer as the finder.

These steps are reported as `SKIP` with the reason, never as `PASS`.

### Live — real accounts
```bash
cp drivers/drivers.env.example drivers/.env.drivers   # then fill it in
npm run drivers:user
npm run drivers:admin
```

| Variable | Used by | Purpose |
|---|---|---|
| `DRIVER_MODE=live` | both | Turn on live mode |
| `BASE_URL` | both | App URL (local dev with real config, or the deployed site) |
| `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` | user only | Normal owner account |
| `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` | admin only | Admin account (must differ from the owner) |
| `DRIVER_ALLOW_WRITES=1` + `TEST_TAG_ID` | both | Allow writes, only on this tag |
| `CHROME_PATH`, `DRIVER_HEADLESS=0`, `DRIVER_*_TIMEOUT_MS` | both | Optional |

**Writes are off by default.** Without `DRIVER_ALLOW_WRITES=1` and
`TEST_TAG_ID`, a live run only reads and opens dialogs, then cancels them.
With both set, writes touch **only `TEST_TAG_ID`**. There is no staging
project (`DEPLOY.md`), so live mode works on production data — use
dedicated test accounts and a tag kept for testing.

## What each driver checks

### User driver (`ROLE = USER`)
| Workflow | Checks | Preview | Live |
|---|---|---|---|
| Registration form | Required fields, first bad field focused, mismatched emails caught; never submits | ✓ | ✓ |
| Sign in | `/login` → `/dashboard` (critical) | skip | ✓ |
| Email verification | Settings badge; unverified account must hit the claim gate | — | ✓ |
| Dashboard | Action needed / Get started / All clear, or a load error with Try again; "Action needed" above "Your items"; tile "Open chats" | ✓ | ✓ |
| Offline | Offline banner appears and clears (network emulated off) | ✓ | ✓ |
| Phone navigation | Tabs Home/My Items/Messages/Alerts; drawer Settings/Privacy/Log out; **no `/admin` links** | ✓ | ✓ |
| My Items | List, empty state with next action, or load error | ✓ | ✓ |
| Claim tag | Scan states (simulated reader), Enter Tag ID manually, field errors, bad ID format | ✓ | ✓ |
| Claim `TEST_TAG_ID` | Real claim | skip | writes only |
| Edit item | Prefilled, empty name refused, Escape returns focus; save | ✓ | save with writes |
| Lost Mode | Confirmation explains it; on → "Lost Mode is now active" → off | ✓ | on/off with writes |
| Finder activity | Incident card with Reply to finder | ✓ | if a report exists |
| Chat | Send with Enter, composer clears, report dialog 500 limit | ✓ (finder view) | on `TEST_TAG_ID`'s chat |
| Mark as recovered | Owner confirm | skip | writes only |
| Recovered list | Section present | ✓ | if any |
| Release | Confirm lists what's deleted, Cancel first; real release at the end | ✓ (dialog) | release with writes |
| Messages / Notifications | Filters (`aria-pressed`, URL); page states | ✓ | ✓ |
| Settings | Dark mode; Name validation; Delete account guarded (never submitted) | theme only | ✓ |
| **Admin console refused** | `/admin/inventory`, `/admin/moderation`, `/admin/owners` → `/admin/login` "does not have admin access", no admin nav | skip | ✓ |
| Sign out | → `/`, then owner pages redirect to `/login` | skip | ✓ |

### Admin driver (`ROLE = ADMIN`)
| Workflow | Checks | Preview | Live |
|---|---|---|---|
| **Console refuses signed-out visitors** | `/admin/inventory` → `/admin/login`, no admin nav | skip | ✓ |
| Sign in | `/admin/login` → `/admin/inventory`; fails clearly if sent to `/admin/verify-email` (critical) | skip | ✓ |
| Console and navigation | "Admin console"; Inventory, NFC Register, Tag Content, Moderation, Owners, Settings; **no `/dashboard` links** | ✓ | ✓ |
| NFC Register | Ready → looking → cancel (simulated reader) | ✓ | ✓ |
| Register/write a real sticker | — | skip (hardware) | skip (hardware) |
| Inventory | Rows or empty state, search, status filter (`aria-pressed`), preview note | ✓ | ✓ |
| Blacklist | Reason required; Escape returns focus; real blacklist | ✓ (dialog) | writes on `TEST_TAG_ID` |
| Unblacklist | Dialog names the restored status | preview note | ✓ / writes |
| Tag Content | List state | ✓ | ✓ |
| Moderation | Queue or empty; Ban confirm explains its limit (cancelled) | ✓ | ✓ |
| Reported chat | Opens read-only for admin, no composer | skip | if a report exists |
| Owners | Lookup result (preview message / no owner / owner card); never disables | ✓ | ✓ |
| Error log | List or empty; Clear all asks first (cancelled) | ✓ | ✓ |
| Settings | Passcode card; Turn off asks first (cancelled); test-tag button refuses in preview; access badge | ✓ | ✓ |
| Sign out | → `/`, then console redirects to `/admin/login` | skip | ✓ |

## Role separation
- **Two files, two roles.** No shared driver with an `if (role === 'admin')`
  branch. `driver-config.js` and `browser.js` hold only role-neutral code
  (settings, starting Chrome, clicking, waiting, screenshots).
- **Separate credentials.** Each driver reads only its own variables and
  refuses to run if the owner and admin emails are the same.
- **Separate browsers.** Each run starts its own Chrome with a new,
  throw-away profile, on its own port — no shared sign-in or storage.
- **Each driver proves the other side is closed to it.** The user driver
  checks that admin routes redirect it away and that no admin links render;
  the admin driver checks the console needs sign-in and shows no owner links.
- The drivers **don't change app logic or rules** to pass. A failure is
  reported as a bug.

## Not covered (manual checks)
- Real NFC hardware (scan to claim, register, write) — the drivers use a
  simulated `NDEFReader` that never reads a tag.
- A finder's side of the flow (report, finder chat) — it's neither the owner
  nor the admin role. Mark as recovered in live mode needs a finder report on
  `TEST_TAG_ID` first.
- Email verification links, password reset emails.
- Screen readers (TalkBack, VoiceOver).
- Forcing a Firestore permission or load error (B1 error states); the
  drivers only check that a load error, if it appears, offers Try again.
