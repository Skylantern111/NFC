

# Email ownership plan: verify admins, catch typos, fix a wrong email

Status: **implemented** 2026-09-29 (code, rules, tests, docs). Still yours:
§1.5 (make sure your admin is verified or has the custom claim before
deploying), §5 cleanup, and the §8 live checks. Date: 2026-09-29.
Branch: `tag-content-security-audit` (after `bbde434`).

## Why

A tester signed up with a wrong email, and the app created the account.
It did this for an admin account too.

No sign-up form can know whether an address exists, or who owns it,
until a message is sent there and someone clicks the link. So creating
the account is normal. What matters is what the account can do before
the email is verified.

| Account | Today (after `bbde434`) | Risk |
|---|---|---|
| Owner, wrong email | Account exists, but can't claim tags (the rules require `email_verified`). | Low. The owner can never reset the password, and a stranger may get our verification email. |
| Passcode admin, wrong email | **Full admin right away.** Admins were exempted from verification (SYSTEM_AUDIT_ROUND2.md B7), because the emails weren't arriving then. | **High.** Anyone with the passcode and any made-up address gets the admin console. Nobody can recover the account, and nobody can reach its owner. |

Email delivery now works: there is the verify page, the Spam hint, and
automatic detection. So the reason for the B7 exemption is gone.

## Decisions

- **D1.** Passcode admins must verify their email before any admin
  rights apply, in the app and in the database rules. This reverses the
  B7 exemption.
- **D2.** Admins made with `scripts/setAdmin.js` (custom claim) stay
  exempt. That path needs a service-account key and is set up by hand.
- **D3.** Owners and admins type their email twice at sign-up.
- **D4.** An unverified account can change its email from the verify
  page instead of starting over.
- **D5.** Existing wrong-email accounts are cleaned up by hand in the
  Firebase console. The app has no Cloud Functions (Spark plan), so it
  can't delete Auth users itself.

## 1. Admins must verify (D1, D2)

### 1.1 Rules (`firestore.rules`)
- In `isAdmin()`, the passcode path becomes:
  `users/{uid}.isAdmin == true && request.auth.token.get('email_verified', false) == true`.
- The custom-claim path (`token.admin == true`) stays as it is.
- The claim rule already reads `isVerifiedEmail() || isAdmin()`, so it
  needs no change.
- Update the comment at lines 66–69. Remove the "B7's requirement was
  removed" note and say that passcode admins must verify.

### 1.2 Admin check in the app (`src/lib/adminAuth.js`)
- `getAdminStatus()` mirrors the rules. `profile.isAdmin === true` only
  counts when `user.emailVerified` is true.
- New return value `'unverified'`: the account is a passcode admin whose
  email isn't verified yet.

### 1.3 Admin gate and sign-in
- `src/pages/admin/AdminLayout.jsx` (AdminGate): `'unverified'` goes to
  `/admin/verify-email`, not to the login page with "no admin access".
- `src/pages/admin/AdminLogin.jsx`: `'unverified'` does not sign the
  admin out. It navigates to `/admin/verify-email`.
- `src/components/SignupForm.jsx` (admin path):
  - After the `users/{uid}` create succeeds, call `sendVerification()`
    (`src/lib/emailVerification.js`).
  - Navigate to `/admin/verify-email` instead of `/admin/inventory`.
  - Remove the "Admins don't verify" branch.

### 1.4 Verify page for both roles
- Make `src/pages/dashboard/VerifyEmail.jsx` into a shared
  `src/pages/VerifyEmail.jsx` with a `role` prop:
  - `owner`: done → `/dashboard`
  - `admin`: done → `/admin/inventory`
- Routes:
  - `/dashboard/verify-email`: inside DashboardLayout, as today.
  - `/admin/verify-email`: **outside** AdminGate, since the gate would
    refuse the unverified admin. It gets its own small guard: signed-in
    only, otherwise go to `/admin/login`.
- Auto-detection: run `useVerificationWatch()` (`AuthContext.jsx`) on the
  admin verify page as well. After the token refresh, the rules see
  `email_verified`, and AdminGate re-checks on the next navigation.
- The continue link in the email becomes role-aware:
  `sendVerification(user, { returnTo })`. The admin gets
  `/admin/verify-email?verified=1`, and the page handles `?verified=1`
  the same way the dashboard does.

### 1.5 Existing passcode admins
- Once 1.1 is deployed, any unverified passcode admin loses admin rights.
  They land on `/admin/verify-email` at the next sign-in.
- **Before deploying:** make sure at least one admin can still get in:
  - Run `scripts/setAdmin.js` for your own account (custom claim, exempt
    by D2), **or**
  - verify your admin account's email first. It is a normal Firebase
    user, so an owner-style verify on it works.
- Document this in `docs/FIREBASE_SETUP.md` §5 (first admin).

## 2. Type the email twice (D3)

In `src/components/SignupForm.jsx`:
- Add a `confirmEmail` field under Email, using the same pattern as
  `confirmPassword`.
- Error text: "The two emails don't match."
- Compare trimmed and lower-cased values.
- Set `autoComplete="off"` on the confirm field, so autofill doesn't copy
  the typo into both fields.
- Show it on both the owner and the admin sign-up forms.
- Under Email, add the hint: "We'll send a link here. You need it to
  claim tags." For admins: "…to open the admin console."

## 3. Change a wrong email before verifying (D4)

On the verify page, add a "Wrong email? Change it" section:
- It asks for the new email (typed twice) and the current password.
- It re-authenticates with `EmailAuthProvider.credential` and
  `reauthenticateWithCredential`, because Firebase requires a recent
  login to change the email.
- It calls `verifyBeforeUpdateEmail(user, newEmail, { url: <continue> })`.
  Firebase emails the **new** address and switches the account's email
  only when that link is clicked.
- The page then shows: "Link sent to <new>. The old address stays on the
  account until you click it."
- After the switch, keep `users/{uid}.email` in step. The rules
  (`emailMatchesLogin`, SYSTEM_AUDIT_ROUND4 B1) only accept the sign-in
  email:
  - In `AuthContext`'s `users/{uid}` snapshot, when
    `snap.data().email !== user.email` and the user is verified, update
    the doc's `email` field. Best-effort, with a `.catch`.
  - `email` is in the rule's update allow-list, so this is a normal owner
    write.
- Errors to handle:
  - `auth/email-already-in-use`
  - `auth/invalid-email`
  - `auth/wrong-password` / `auth/invalid-credential`
  - `auth/too-many-requests`
  - `auth/requires-recent-login`, which asks for the password again.
- Keep the existing "Sign up with a different email" link as the
  fallback. It signs out and goes to `/register`. The old wrong account
  stays until someone removes it by hand (§5).

## 4. Admin visibility

`src/pages/admin/Owners.jsx`, in the owner card:
- Add a "Verified email" / "Email not verified" `StatusBadge`. The
  profile doc doesn't hold this, so store it:
  - Write `emailVerified: true` to `users/{uid}` once `refreshUser()`
    sees the change.
  - Add `emailVerified` to the rules' allowed `users` fields as
    owner-writable `true` only. It is informational; the rules never
    trust it for access.
- Optional: a note that unverified accounts older than 7 days are
  probably typos, and can be deleted in the console (§5).

## 5. Clean up existing bad accounts (by hand, D5)

Firebase console:
1. **Authentication → Users:** find the wrong-email accounts and delete
   them. This deletes the sign-in only.
2. **Firestore → `users/{uid}`:** delete the same UIDs. For an owner that
   has tags, prefer **Admin → Owners → Disable account**, or release the
   tags first.
3. If the admin passcode may have leaked: go to **Admin → Settings →
   Admin sign-up passcode**, click **Generate** to replace it, then turn
   it off until the next admin sign-up.

Add this checklist to `docs/FIREBASE_SETUP.md`.

## 6. Tests

`tests/firestore.rules.test.js`:
- Replace the test "B7 reverted: a passcode admin is admin with or
  without a verified email" with:
  - A passcode admin **without** `email_verified` cannot read
    `tagAdmin/*` or list `tags`.
  - A passcode admin **with** `email_verified: true` can.
  - A custom-claim admin without `email_verified` can (D2).
- Update the existing passcode-admin contexts to pass
  `{ email_verified: true }` wherever they expect admin rights.
- `users/{uid}` update with `emailVerified: true` is allowed; `false` or
  another user's doc is refused.

`tests/flows.test.js`:
- The admin context is a custom-claim or verified admin. Check that the
  flows still pass.

## 7. Docs

- `docs/SYSTEM_AUDIT_ROUND2.md` B7: "Re-applied 2026-09-xx: passcode
  admins must verify; custom-claim admins exempt."
- `ARCHITECTURE.md`:
  - §3: the admin definition.
  - §8.2: confirm email, and change email.
  - Add a new admin-signup step.
- `docs/FIREBASE_SETUP.md`:
  - §5: verify or use `setAdmin.js` before this deploy.
  - The §5 cleanup checklist.
  - Smoke test: an admin sign-up has to verify.
- `docs/README.md`: add this file to the Audits table.

## 8. Rollout order

1. Make sure your own admin account is verified, or has the custom
   claim (§1.5).
2. Merge, then run `npm run build` and `npm test`.
3. `firebase deploy --only hosting,firestore:rules`. The rules and the
   app must go together, or unverified admins get a "no access" loop.
4. Clean up by hand (§5).
5. Live checks:
   1. An owner sign-up with mismatched emails is blocked at the form.
   2. An owner signs up, changes the email on the verify page, clicks the
      new link, then claims.
   3. An admin signs up with the passcode, lands on
      `/admin/verify-email`, and gets no admin data before clicking the
      link.
   4. The admin clicks the link. The page moves to Inventory within about
      5 s.
   5. An existing unverified passcode admin signs in and lands on the
      verify page, not on "no access".
   6. A custom-claim admin is unaffected.

## Files touched

- **Rules and tests:** `firestore.rules`, `tests/firestore.rules.test.js`,
  `tests/flows.test.js`
- **Auth logic:** `src/lib/adminAuth.js`, `src/lib/emailVerification.js`,
  `src/context/AuthContext.jsx`
- **Forms and pages:**
  - `src/components/SignupForm.jsx`
  - `src/pages/VerifyEmail.jsx` (moved from `dashboard/`)
  - `src/pages/admin/AdminLayout.jsx`, `src/pages/admin/AdminLogin.jsx`,
    `src/pages/admin/Owners.jsx`
  - `src/App.jsx`
- **Docs:** `ARCHITECTURE.md`, `docs/FIREBASE_SETUP.md`,
  `docs/SYSTEM_AUDIT_ROUND2.md`, `docs/README.md`
