import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase/config';

// Browser crash reporting into Firestore (SYSTEM_AUDIT_ROUND4.md E1) — the
// app had no error monitoring, so a crash on a finder's phone was invisible.
// Read by admins on admin/Errors.jsx; shape and sizes enforced by
// firestore.rules (clientErrors).
//
// Never throws, never blocks: reporting must not make a crash worse.
// At most MAX_PER_LOAD reports per page load, and each distinct message once.

const MAX_PER_LOAD = 5;
let sent = 0;
const seen = new Set();

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

export function reportError(error, context = '') {
  if (!firebaseReady || sent >= MAX_PER_LOAD) return;
  try {
    const base = error?.message || String(error || 'Unknown error');
    const message = clip(context ? `${context}: ${base}` : base, 500);
    if (seen.has(message)) return;
    seen.add(message);
    sent += 1;
    addDoc(collection(db, 'clientErrors'), {
      message,
      stack: error?.stack ? clip(error.stack, 4000) : null,
      // Path only — no query string or hash (they can carry tokens).
      url: clip(window.location.pathname, 300),
      userAgent: clip(navigator.userAgent, 300),
      uid: auth.currentUser?.uid || null,
      at: serverTimestamp(),
    }).catch(() => {});
  } catch {
    // Reporting failed — nothing else to do.
  }
}

// Uncaught errors and unhandled promise rejections outside React render
// (event handlers, async code). Called once from main.jsx.
export function installGlobalErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error || e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'));
}
