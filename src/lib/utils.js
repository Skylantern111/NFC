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

// Splits an array into groups of `size` — used to page a Firestore `in`
// query (capped at 30 disjunction values) past its limit instead of silently
// truncating to the first 30 (see lib/moderation.js, lib/ownerItems.js).
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

// Same idea as friendlyAuthError but for Firestore's error codes, which
// otherwise leak raw strings like "Missing or insufficient permissions" or
// "FirebaseError: [code=unavailable]: ..." straight into toasts. Unlike auth
// errors, no built-in message is usable as a fallback here — Firestore's
// default messages are meant for developers, not end users — so this always
// falls back to a generic, human sentence instead of err.message.
const FIRESTORE_ERROR_MESSAGES = {
  'permission-denied': "You don't have permission to do that.",
  unavailable: 'Network error — check your connection and try again.',
  'deadline-exceeded': 'That took too long. Check your connection and try again.',
  'not-found': "That couldn't be found — it may have been removed.",
  'resource-exhausted': 'Too many requests right now. Wait a moment and try again.',
  cancelled: 'That was cancelled. Try again.',
};

export function friendlyFirestoreError(err, fallback = 'Something went wrong. Try again.') {
  return FIRESTORE_ERROR_MESSAGES[err?.code] || fallback;
}

// Live password-requirements checklist (Register.jsx). Each key maps to one
// visible checklist row; order here is the order they're rendered in.
export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lower', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { key: 'number', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { key: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function passwordRequirementResults(password) {
  return PASSWORD_REQUIREMENTS.map((r) => ({ ...r, met: r.test(password || '') }));
}

// Strength is just "how many requirements are met" — simple and matches what
// the checklist above already shows, rather than a separate scoring scheme
// the user would have to reconcile against the checklist.
export function passwordStrength(password) {
  if (!password) return null;
  const metCount = PASSWORD_REQUIREMENTS.filter((r) => r.test(password)).length;
  if (metCount <= 2) return 'weak';
  if (metCount <= 4) return 'medium';
  return 'strong';
}
