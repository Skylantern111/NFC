import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../firebase/config';
import { friendlyAuthError } from './utils';

// Owner email verification. Owners must verify before claiming a tag
// (firestore.rules, itemOwners create); admins are exempt.
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

// Sends the verification email. The link's "Continue" button brings the
// owner back to the dashboard, which then re-checks the status. Returns
// { ok: true } or { ok: false, error } with a message for people.
export async function sendVerification(user) {
  if (!user) return { ok: false, error: 'You are signed out. Sign in and try again.' };
  const settings = { url: `${window.location.origin}/dashboard?verified=1`, handleCodeInApp: false };
  try {
    try {
      await sendEmailVerification(user, settings);
    } catch (err) {
      // The continue link needs the site in Firebase Auth's authorized
      // domains. If it isn't, still send the email, just without the link.
      if (err?.code !== 'auth/unauthorized-continue-uri' && err?.code !== 'auth/invalid-continue-uri') throw err;
      await sendEmailVerification(user);
    }
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
