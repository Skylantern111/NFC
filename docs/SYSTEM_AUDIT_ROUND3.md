# System Audit — Round 3

Status: **implemented** (2026-09-27) except B2/B3 (Firebase console settings for the project owner) — see "Implementation status" at the end. Date: 2026-09-27.
Code audited: branch `tag-content-security-audit` at `cf65f00`, the version
live on https://nfc-lost-and-found.web.app.

**Method.** Rounds 1–2 found bugs by reading code, and the rules tests
missed A0 because their test users were unrealistic. This round adds a
**flow replay**: a temporary emulator test that runs the app's real
Firestore calls, with the same shapes as the code, as three realistic
users:
- an owner who signed up normally (has a profile doc)
- a finder with no account
- a passcode admin whose email is not verified

It covers 58 steps:
- signup
- tag registration
- inventory
- claim
- lost mode
- NFC profile
- finder page, scan, report, chat and messages
- notifications
- the owner inbox
- both report directions
- moderation (ban, review, unban)
- owner lookup
- tag content
- recovery
- release
- blacklist and un-blacklist

**57 of 58 steps pass.** The one that fails is critical (A1 below). The
probe file was deleted afterwards; making it permanent is recommended (D1).

Severity: **Critical** = a main flow is broken live. **High** = security
or privacy. **Medium** = wrong behavior in real use. **Low** = hygiene or
docs.

---

## A. Critical

### A1 [Critical, live] Owners never see their own tags (verified)
`firestore.rules` `itemOwners`:
```
allow read: if ownsTag(tagId) || isAdmin() || (isSignedIn() && resource == null);
```
`read` covers queries too. For a **query**, `tagId` (the document ID) has no
value. `ownsTag(tagId)` fails with *"Null value error. for 'list'"*, so the
owner's own query is denied:
```
query(collection(db, 'itemOwners'), where('ownerUid', '==', user.uid))   // lib/ownerItems.js#useOwnerTagIds
```
`useOwnerTagIds` is the root of the whole owner side. When it fails, it
returns an empty list. So on the live site, an owner:
- sees **no items** on Dashboard and My Items, even right after a
  successful claim
- sees **no chats** in Messages and **no notifications**, and gets no
  unread badge or tab count
- is told "This tag isn't one of your claimed items" on My NFC Profile
- is treated as the **finder** in their own chat (`Chat.jsx` role check,
  Round 1 B1), so their replies are rejected and "Mark as recovered" is
  hidden

The rule has been unchanged since commit `1049efd`. The owner side has
most likely never worked on a real Firebase project; it only looked right
in preview mode with mock data. The rules tests never ran this query.

**Fix** (verified: with it, all 58 flow steps pass):
```
allow get:  if ownsTag(tagId) || isAdmin() || (isSignedIn() && resource == null);
allow list: if isAdmin()
  || (isSignedIn() && resource.data.ownerUid == request.auth.uid && !isDisabledOwner(request.auth.uid));
```
Add a rules test for this exact query (owner with a profile doc).

---

## B. Security and privacy

### B1 [Medium] No security headers on the hosted site
Only `Strict-Transport-Security` is sent. Missing:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy` (e.g. `strict-origin-when-cross-origin`; the chat
  URL contains the chat ID, which works like a password for the finder)
- `X-Frame-Options: DENY`, or CSP `frame-ancestors 'none'` (clickjacking
  on the admin console)
- a Content-Security-Policy

**Fix:** add these to `firebase.json` `hosting.headers`. The CSP must
allow:
- Firebase: `*.googleapis.com`, `*.firebaseapp.com`
- Google Fonts: `fonts.googleapis.com`, `fonts.gstatic.com`
- OpenStreetMap tiles: `*.tile.openstreetmap.org`

### B2 [Low] Firebase API key has no referrer restriction (check)
The web API key is public by design, but it should be restricted to the
site's domains in Google Cloud Console → Credentials, so other sites can't
use it against this project's Auth quota. This can't be checked from the
repo.
**Fix:** allow HTTP referrers `nfc-lost-and-found.web.app/*`,
`nfc-lost-and-found.firebaseapp.com/*` and `localhost:*`.

### B3 [Low] Firebase Auth email-enumeration protection (check)
Signup says "An account already exists with that email", so anyone can
test which emails have accounts.
**Fix:** turn on email-enumeration protection in Firebase Console →
Authentication → Settings, and use a neutral message.

### Carried over (accepted in Round 2, unchanged)
- Notification spam, and finder identity as a localStorage token: needs
  App Check.
- `react-router` 6.x moderate advisories: needs the v7 upgrade.

---

## C. Workflow and UX

### C1 [Medium] Release is offered for blacklisted tags
`Items.jsx` shows "Release tag" for every item. On a blacklisted tag, the
rules reject the release transaction (it needs `status == 'claimed'`),
but only **after** `releaseTag` has already deleted the tag's reports,
chats and notifications (Round 2 B5 order). The owner loses the history
and still has the tag.
**Fix:** hide or disable Release while `item.tagStatus === 'blacklisted'`,
and check the status at the top of `releaseTag` before deleting anything.

### C2 [Low] No per-mode tap statistics view
Scans now record `landingMode` (Round 1 C2), but no screen shows
anything except the total count. (Also listed in plan §D.)

### C3 [Low] Firestore data has no backup
The project is on the free Spark plan: no point-in-time recovery and no
scheduled exports. A bad admin bulk action, or a bug like Round 1's
release clean-up, can't be undone.
**Fix (free):**
- A periodic manual export with `gcloud firestore export` (needs a
  Cloud Storage bucket, which needs Blaze), **or**
- An admin-run script (Admin SDK) that dumps collections to local JSON.
  This works on the free plan.

---

## D. Testing and docs

### D1 [Medium] The rules tests don't cover real app flows
Both critical bugs (Round 2 A0 and A1 above) slipped past 60 passing rules
tests. Those tests check single rules with hand-made data, not the app's
real sequence of calls with realistic users.
**Fix:** commit the flow-replay test from this audit as
`tests/flows.test.js`, and keep it in `npm test`. It replays the
same Firestore calls as the app, with a profile-doc owner, an anonymous
finder and a passcode admin.

### D2 [Low] README is out of date
`README.md`:
- line 28 says nothing in `REDESIGN_PLAN.md` is implemented beyond the
  design pass (most of it is now)
- lines 88–104 say the custom claim is the only way to be admin, and that
  non-admins are redirected to `/login`. Both are wrong now: there is
  passcode signup at `/admin/register`, and redirects go to `/admin/login`.
- the `tags` table row still lists `flagReason` on the public tag doc (it
  moved to `tagAdmin`) and says "public read" (it's get-only now)
- line 122 says the serial-number cross-check on claim isn't implemented
  (it is)

**Fix:** update these sections. Also point to the audit files and the
current deploy command
(`firebase deploy --only firestore:rules,firestore:indexes,hosting`).

### D3 [Low] 14 planning and audit markdown files in the repo root
Plans, audits and change logs from every round sit in the root, and some
are superseded. Hard to tell what's current.
**Fix:** move them to `docs/` with a short index that says which are done.

---

## E. Suggested fix order

1. **A1** immediately: a rules-only change that makes the entire owner
   side work. Add the query test, and deploy the rules alone if needed.
2. **D1**: commit the flow replay, so a broken flow can't ship again.
3. **C1**: stops the release path from destroying history.
4. **B1**: security headers (with a CSP that allows Firebase, fonts and
   map tiles).
5. **B2, B3**: console settings, done by the project owner.
6. **D2, D3, C2, C3** when convenient.

---

## Implementation status

| Item | Done |
|---|---|
| A1 | `itemOwners`: `get` keeps the old rule; new `list` allows admins, or a signed-in, non-disabled caller whose query only returns rows with their own `ownerUid`. `tests/flows.test.js` checks the owner query and that a stranger can't list someone else's tags. |
| B1 | `firebase.json` sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy` (camera, microphone, payment and USB off; geolocation for this site only). The Content-Security-Policy ships as **`Content-Security-Policy-Report-Only`**: it logs violations in the browser console without blocking anything. Rename the header to `Content-Security-Policy` once a pass through every page shows no violations. The inline theme script moved to `public/theme-init.js`, so the policy can use `script-src 'self'`. |
| C1 | "Release tag" is hidden on blacklisted tags. `releaseTag` checks that the tag is `claimed` **before** deleting any history. |
| C2 | The admin tag editor shows taps split by mode (Lost & Found / Profile / Redirect); older taps without a mode count only in the total. |
| C3 | `scripts/exportFirestore.js`: a free local JSON backup of every collection and subcollection (`backups/`, git-ignored). |
| D1 | `tests/flows.test.js` (29 steps) runs with `npm test`. 89 tests in total. |
| D2 | `README.md` rewritten. `ARCHITECTURE.md` access columns updated (public *by ID*, list restricted). |
| D3 | Plans, audits and change logs moved to `docs/`, with `docs/README.md` as an index and status list. |

**Not done here (project owner, in the Firebase / Google Cloud console):**
- **B2:** Google Cloud Console → APIs & Services → Credentials → the
  "Browser key" → Application restrictions: *Websites* →
  `https://nfc-lost-and-found.web.app/*`,
  `https://nfc-lost-and-found.firebaseapp.com/*`, `http://localhost:*/*`.
- **B3:** Firebase Console → Authentication → Settings → *Email enumeration
  protection* → enable. Sign-in errors then stop revealing whether an
  email exists. Signup necessarily still reports "already in use";
  Firebase can't hide that for account creation.
