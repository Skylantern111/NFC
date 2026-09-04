import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Accepts either a Firestore Timestamp (.toMillis()) or an ISO string, so
// callers don't need to branch on live-vs-mock data shape.
export function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function relativeTimeFromMs(ms) {
  if (!ms) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export function daysSinceMs(ms) {
  if (!ms) return 0;
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

// Maps common Firebase Auth error codes to user-facing copy instead of
// showing raw strings like "Firebase: Error (auth/invalid-email)." to users
// (Login.jsx / Register.jsx). Falls back to the raw message for anything
// unmapped rather than hiding it.
const AUTH_ERROR_MESSAGES = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect password. Try again or reset it.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/email-already-in-use': 'An account already exists with that email.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
};

export function friendlyAuthError(err) {
  return AUTH_ERROR_MESSAGES[err?.code] || err?.message || 'Something went wrong. Try again.';
}
