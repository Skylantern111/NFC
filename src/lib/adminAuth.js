import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { reportError } from './errorLog';

// Mirrors firestore.rules#isAdmin() so AdminLayout/AdminLogin/Chat.jsx can't
// drift on what "admin" means:
//   - never when users/{uid}.disabled (SYSTEM_AUDIT_ROUND2.md A2)
//   - the real custom claim (scripts/setAdmin.js), or
//   - the self-serve users/{uid}.isAdmin flag (admin signup passcode).
//
// Returns 'admin', 'not-admin', or 'unknown' when the profile couldn't be
// read (offline, a stalled connection right after a reload). 'unknown' used
// to count as "not an admin", which sent a real admin back to the sign-in
// page with "Your account does not have admin access".
export async function getAdminStatus(user) {
  if (!user) return 'not-admin';
  let claims = {};
  try {
    claims = (await user.getIdTokenResult()).claims;
  } catch {
    // Fall through with no claims.
  }
  let snap = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2 && !snap; attempt++) {
    try {
      snap = await getDoc(doc(db, 'users', user.uid));
    } catch (e) {
      lastError = e;
      if (e?.code === 'permission-denied') break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!snap) {
    reportError(lastError, 'getAdminStatus');
    // The profile is what can revoke access (disabled), so without it only
    // a permission error is a definite no.
    return lastError?.code === 'permission-denied' ? 'not-admin' : 'unknown';
  }
  const profile = snap.exists() ? snap.data() : null;
  if (profile?.disabled) return 'not-admin';
  return claims.admin === true || profile?.isAdmin === true ? 'admin' : 'not-admin';
}

export async function checkIsAdmin(user) {
  return (await getAdminStatus(user)) === 'admin';
}
