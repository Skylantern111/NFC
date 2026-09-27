# Round 4 — Implementation Plan

Status: **implemented** (2026-09-27) except Phase 0 and the live pass in Phase 3 (yours) and Phase 5 (postponed). Details: "Implementation status" in `SYSTEM_AUDIT_ROUND4.md`. Date: 2026-09-27.
Implements [`SYSTEM_AUDIT_ROUND4.md`](SYSTEM_AUDIT_ROUND4.md). Everything
stays on the free Spark plan; nothing needs Cloud Functions.

Each step lists who does it:
- **You:** needs your GitHub or Firebase console, or a phone.
- **Claude:** code, tests and docs in this repo.

---

## Facts this plan relies on (checked 2026-09-27)
- `origin/main` is an **ancestor** of `tag-content-security-audit`, so
  merging is a fast-forward, with no conflicts. `origin/renny_04` is also
  already contained in the branch.
- The GitHub CLI (`gh`) isn't installed here. PR and repo settings are
  done in the GitHub web UI, or after installing `gh`.
- `npm test` needs the `firebase` CLI and Java. The CLI is installed
  globally, not in `package.json`; CI needs it as a devDependency.
- Local tools: Node 24, Java 26.

---

## Phase 0 — Make `main` the source of truth (A1) · You, ~10 min

1. On GitHub, merge the open PR `tag-content-security-audit` → `main`
   ("Create a merge commit" or "Rebase and merge"; both are clean).
   - Alternative from this machine: `git push origin tag-content-security-audit:main`
     (fast-forward only).
2. **Branch protection** for `main` (Settings → Branches → Add rule):
   - require a pull request before merging
   - once Phase 1 is in, require the CI status check to pass
3. From then on, deploy only from an up-to-date `main`. `DEPLOY.md`
   (Phase 1) makes that the written rule.
4. Optional: delete the merged branches `claim-flow-fix-nfc-tap` and
   `renny_04`, after checking with their authors.

**Done when:** `git log origin/main -1` = the latest branch commit.

---

## Phase 1 — CI on every push and pull request (A2) · Claude

**Files**
- `package.json`: add `firebase-tools` (pinned) as a devDependency, so
  `npm test`'s `firebase emulators:exec` uses the local copy.
- `.github/workflows/ci.yml`:
  - triggers: `push` and `pull_request` on any branch
  - Ubuntu, Node 22 (LTS), Temurin Java 21
  - `npm ci` → `npm run build` → `npm test`
  - cache `~/.npm` and `~/.cache/firebase/emulators` (the emulator jar)
  - no secrets needed: the build runs in preview mode and the tests use
    the emulator only
- `DEPLOY.md` (root, short):
  - deploy only from `main` after CI is green
  - the deploy command
  - the rollback command (`firebase hosting:clone <site>:<previous-version> <site>:live`)

**Verify:** push a branch, and the Actions run passes (build and 89
tests). A deliberately broken rule makes it fail.

---

## Phase 2 — Admin console shows real emails only (B1) · Claude

**Rules** (`users/{uid}`):
- **create:** `!('email' in request.resource.data) || request.resource.data.email == request.auth.token.email`
- **self-update:** the same check, but only when `email` is among the
  changed keys. Existing docs keep working, and removing the field is
  allowed (needed by Phase 4).

**App:**
- `SignupForm.jsx` and `AuthContext.jsx` already write `user.email`, so
  they're unchanged.
- **Owners** and **Inventory** labels become "Sign-up email".

**Tests** (`tests/firestore.rules.test.js`):
- create with a matching email → allowed
- create with a different email → denied
- self-update changing email → denied
- self-update of other fields on an old doc whose email differs → allowed
  (no lockout)

**Existing data:** a spoofed email already stored stays. A one-off
`scripts/listEmailMismatches.js` (Admin SDK, read-only) compares
`users/{uid}.email` with the Auth record and lists mismatches.

---

## Phase 3 — Live verification, then enforce the CSP (E2) · You + Claude

1. **Claude:** add a checklist to `docs/FIREBASE_SETUP.md` §9. It covers
   every page as owner, finder and admin:
   - map
   - vCard download
   - redirect page
   - NFC register and claim
2. **You:** on the live site, with DevTools → Console open:
   1. run the checklist
   2. copy any `Content-Security-Policy-Report-Only` warnings
   3. on an Android phone with Chrome, register a real NTAG sticker, write
      it, and claim it by tapping
3. **Claude:**
   - adjust the CSP for any legitimate source the warnings show
   - rename the header `Content-Security-Policy-Report-Only` →
     `Content-Security-Policy` in `firebase.json`
   - deploy to production (no staging yet, decision 4), recheck at once, and roll back with the hosting clone command if anything breaks
4. **Record** the result (date, device, browser) in `SYSTEM_AUDIT_ROUND4.md`.

**Risk:** an enforced CSP that's too strict breaks pages. Mitigations:
enforce only after a clean report-only pass, and roll back with the
hosting clone command in `DEPLOY.md`.

---

## Phase 4 — "Delete my account" + privacy note (C1) · Claude

**Flow** (Settings → "Delete account", in a confirm dialog: type `DELETE`
and your password):
1. Reauthenticate (`reauthenticateWithCredential`). Firebase requires a
   recent login to delete a user.
2. For each owned tag:
   - **claimed:** the existing `releaseTag()`. It clears reports, chats and
     notifications, and returns the tag to stock.
   - **blacklisted:** delete `items` and `tagProfiles` and the history,
     then delete `itemOwners` via a **new rules clause** (below). The tag
     stays blacklisted with no owner.
3. **Delete the profile** `users/{uid}` (decision 2: full deletion).
4. `deleteUser(auth.currentUser)`, then go to `/` with a confirmation toast.

**Rules:**
- `itemOwners` delete gets a second allowed case: `ownsTag(tagId)` and the
  tag is `blacklisted` (it stays blacklisted).
- `users/{uid}` delete (currently `false`) becomes
  `isSignedIn() && request.auth.uid == uid && !isDisabledOwner(uid)`.
  This stays safe against the Round 1 A1/A2 tricks:
  - **Self-admin:** re-creating a profile still needs the passcode for
    `isAdmin: true`, and can't set `disabled: true`.
  - **Undoing a disable:** a **disabled** account can't delete its
    profile, so it can't delete and re-create to shed `disabled`.
  - **After a real deletion:** the Auth account is gone too, so nobody can
    sign in as that user again.
- `Inventory.jsx` **Unblacklist:** if `itemOwners/{id}` no longer exists,
  restore to `registered` rather than `claimed`, so no ownerless "claimed"
  tag is left behind.

**Privacy note:** a `/privacy` page, linked from the footer, signup and
Settings. It says:
- what is stored
- that finder locations are kept until the report is resolved (Phase 7 C3)
- how to delete an account

**Tests:**
- rules: the owner can delete `itemOwners` on a blacklisted tag; a
  stranger can't; a user can delete their own profile; a **disabled** user
  can't; someone else's profile can't be deleted; a re-created profile
  still can't self-grant admin
- flows test: step 9, "owner deletes account" (Auth deletion isn't
  emulated here, only the Firestore side)

**Decided (§Decisions 2):** full deletion, with the rules above.

---

## Phase 5 — Staging project and preview channels (A3) · **Postponed (decision 4)**

Not doing this yet. Until then, deploys go straight to production, so the
other phases compensate:
- CI must be green before a deploy.
- Rules changes get emulator tests plus the flows replay.
- The enforced CSP (Phase 3) is rolled out right after a clean report-only
  pass, with the rollback command at hand.

Kept below for later.

1. **You (console):**
   1. Create a second Firebase project, e.g. `nfc-lost-and-found-staging`.
   2. Enable Firestore (production mode, same region) and Email/Password
      auth.
   3. Register a web app and copy its config.
2. **Claude:**
   - `firebase use --add` → alias `staging`
   - `.env.staging.example`
   - `package.json` scripts:
     - `build:staging` (`vite build --mode staging`)
     - `deploy:staging`
     - `deploy:prod` (refuses unless on `main` with a clean tree)
     - `preview` (`firebase hosting:channel:deploy preview --expires 7d`)
3. **You:** put the staging config in `.env.staging` (git-ignored), and run
   `scripts/setAdmin.js` against staging for a test admin.
4. **Process** (`DEPLOY.md`):
   1. PR
   2. CI green
   3. `deploy:staging`
   4. smoke test
   5. merge
   6. `deploy:prod`

**Risk:** the two projects drift. Mitigation: they share the same
rules, indexes and hosting config from the repo, and only the web config
differs.

---

## Phase 6 — Client error log (E1) · Claude

Chosen over Sentry: no new vendor, no CSP change, stays inside Firebase.

- **Rules:** `clientErrors/{id}`
  - `create` for anyone: `hasOnly(['message', 'stack', 'url', 'userAgent', 'uid', 'at'])`,
    `message` ≤ 500, `stack` ≤ 4000, `url` ≤ 300, `at == request.time`,
    `uid` null or the caller
  - `read, delete`: admin only
- **`src/lib/errorLog.js#reportError(err, context)`:**
  - at most 5 reports per page load, and duplicates skipped
  - URL stripped of query strings (chat IDs stay in the path, which is
    admin-only data)
  - never throws
- **Hooks:** `ErrorBoundary`, `RouteErrorBoundary`,
  `window.onerror` and `unhandledrejection`.
- **Admin page** `/admin/errors` (sidebar "Errors"): the latest 100, newest
  first, grouped by message, with a "Clear all" button.
- **Tests:** rules (anonymous create accepted, extra field or oversize
  rejected, non-admin read denied), plus a flows step.

**Risk:** spam. Bounded sizes and the per-load cap limit it; App Check
would close it (known limitation).

---

## Phase 7 — Low items · Claude

| Item | Change | Test / check |
|---|---|---|
| **D1** | `npm i -D firebase-admin@14`; check every script in `scripts/` still imports and parses (`node --check`), then run the read-only `listSelfServeAdmins.js` against production | `npm audit` shows only the 2 react-router advisories |
| **C5** | `public/robots.txt` (Disallow `/chat/`, `/dashboard/`, `/admin/`); `firebase.json` `X-Robots-Tag: noindex` for those paths | `curl -I` shows the header |
| **B2** | `Inventory.jsx` server search uses `normalizeTagbackId(term)` for the tag ID query | manual: `tbabcd2345` finds `TB-ABCD-2345` |
| **C2** | Remove the phone field from Settings, `SignupForm` and `AuthContext`; Settings save clears an existing `phone` with `deleteField()` | build; flows test step "settings save" updated |
| **C3** | `NfcLanding` rounds `lat`/`lng` to 4 decimals before saving; `markRecovered` sets the report's `location: null` | rules test: resolved report update with `location: null` allowed |
| **E3** | `DEPLOY.md`: check Firestore usage weekly during the pilot (Spark has no usage alerts without billing) | — |
| **E4** | `OwnerTagIdsProvider` in `DashboardLayout`; `useOwnerTagIds` reads the context when present (fallback: own listener, e.g. `Chat.jsx` outside the layout) | flows + build; the Dashboard mounts 1 `itemOwners` listener |
| **C4** | **Not doing** (decision 1): accepted as a known limitation in `README.md` | — |

---

## Decisions (2026-09-27)

1. **C4, per-chat finder tokens: not doing.** It isn't necessary, and it
   would weaken admin bans, which are keyed on the finder token.
2. **Account deletion: full deletion** of `users/{uid}`, with the rules
   above. A disabled user can't delete their profile, and re-creating one
   still needs the passcode for admin.
3. **Error monitoring: in-project `clientErrors`** (Phase 6).
4. **Staging: not yet.** Phase 5 is postponed; deploys stay direct to
   production, behind CI.

## Order and effort

| # | Phase | Who | Rough effort | Needs a deploy |
|---|---|---|---|---|
| 0 | Merge to `main`, branch protection | You | 10 min | no |
| 1 | CI + `DEPLOY.md` | Claude | small | no |
| 2 | Email check (B1) | Claude | small | rules |
| 5 | Staging + preview — **postponed** | — | — | — |
| 3 | Live check → enforce CSP | You + Claude | medium | hosting |
| 4 | Account deletion + privacy page | Claude | medium–large | rules + hosting |
| 6 | Error log | Claude | medium | rules + hosting |
| 7 | Low items | Claude | small each | rules + hosting |

Each phase ends with:
- `npm test` green and `npm run build` clean
- the audit file updated
- a commit on a branch → PR → CI green → merge to `main` → production
  deploy (no staging until Phase 5 is picked up)
