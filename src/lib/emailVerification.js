import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { friendlyAuthError } from './utils';

// Email verification. Owners must verify before claiming a tag
// (firestore.rules, itemOwners create); passcode admins must verify before
// any admin rights apply (isAdmin, EMAIL_OWNERSHIP_PLAN.md D1). Custom-claim
// admins (scripts/setAdmin.js) are exempt.
//
// The rules read the ID token's email_verified claim, which only changes
// when the token is refreshed, so refreshVerified() forces a refresh right
// after the owner clicks the link. Without that, a verified owner would
// still be refused until the token expired (up to an hour).

export const RESEND_COOLDOWN_MS = 60 * 1000;
const SENT_AT_KEY = 'tagback_verify_sent_at';

const SEND_ERRORS = {
  'auth/too-many-requests': 'Too many emails sent to this account. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'No connection — the email was not sent. Check your connection and try again.',
};

function rememberSent() {
  try {
    localStorage.setItem(SENT_AT_KEY, String(Date.now()));
  } catch {
    // Storage blocked: the cooldown just won't survive a reload.
  }
}

// Milliseconds left before another email may be sent (0 = send now).
export function resendWaitMs() {
  try {
    const at = Number(localStorage.getItem(SENT_AT_KEY) || 0);
    return Math.max(0, at + RESEND_COOLDOWN_MS - Date.now());
  } catch {
    return 0;
  }
}

// Where the email's "Continue" button lands; that page re-checks the status.
export const OWNER_RETURN = '/dashboard?verified=1';
export const ADMIN_RETURN = '/admin/verify-email?verified=1';

function continueSettings(returnTo) {
  return { url: `${window.location.origin}${returnTo}`, handleCodeInApp: false };
}

// The continue link needs the site in Firebase Auth's authorized domains.
// If it isn't, still send the email, just without the link.
async function withContinueFallback(send, returnTo) {
  try {
    await send(continueSettings(returnTo));
  } catch (err) {
    if (err?.code !== 'auth/unauthorized-continue-uri' && err?.code !== 'auth/invalid-continue-uri') throw err;
    await send(undefined);
  }
}

// Sends the verification email. `returnTo` picks the page the "Continue"
// button opens (owner dashboard by default). Returns { ok: true } or
// { ok: false, error } with a message for people.
export async function sendVerification(user, { returnTo = OWNER_RETURN } = {}) {
  if (!user) return { ok: false, error: 'You are signed out. Sign in and try again.' };
  try {
    await withContinueFallback((settings) => sendEmailVerification(user, settings), returnTo);
    rememberSent();
    return { ok: true };
  } catch (err) {
    console.warn('sendEmailVerification failed:', err);
    return { ok: false, error: SEND_ERRORS[err?.code] || friendlyAuthError(err) };
  }
}

// Re-reads the account from Firebase and, once verified, refreshes the ID
// token so the rules see email_verified. Returns the current status.
export async function refreshVerified() {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  if (auth.currentUser?.emailVerified) {
    await auth.currentUser.getIdToken(true);
    return true;
  }
  return false;
}

const CHANGE_ERRORS = {
  'auth/email-already-in-use': 'Another account already uses that email.',
  'auth/invalid-email': 'That email address isn’t valid.',
  'auth/wrong-password': 'That password isn’t correct.',
  'auth/invalid-credential': 'That password isn’t correct.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/requires-recent-login': 'Please type your password again and retry.',
  'auth/network-request-failed': 'No connection — nothing was changed. Check your connection and try again.',
};

// EMAIL_OWNERSHIP_PLAN.md D4: fix a mistyped sign-up email without starting
// over. Firebase needs a recent login to change the email, so this signs in
// again with the password first. verifyBeforeUpdateEmail() emails the NEW
// address; the account's email only switches when that link is clicked
// (AuthContext then copies it into users/{uid}.email).
// Returns { ok: true } or { ok: false, error, code }.
export async function changeUnverifiedEmail(user, password, newEmail, { returnTo = OWNER_RETURN } = {}) {
  if (!user) return { ok: false, error: 'You are signed out. Sign in and try again.' };
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    await withContinueFallback((settings) => verifyBeforeUpdateEmail(user, newEmail, settings), returnTo);
    rememberSent();
    return { ok: true };
  } catch (err) {
    console.warn('verifyBeforeUpdateEmail failed:', err);
    return { ok: false, code: err?.code, error: CHANGE_ERRORS[err?.code] || friendlyAuthError(err) };
  }
}
