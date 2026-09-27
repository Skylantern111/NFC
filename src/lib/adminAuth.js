import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Mirrors firestore.rules#isAdmin() so AdminLayout/AdminLogin/Chat.jsx can't
// drift on what "admin" means:
//   - never when users/{uid}.disabled (SYSTEM_AUDIT_ROUND2.md A2)
//   - the real custom claim (scripts/setAdmin.js), or
//   - the self-serve users/{uid}.isAdmin flag (admin signup passcode), which
//     also needs a verified email (ROUND2 B7).
//
// Returns 'admin' | 'unverified' (passcode admin, email not verified yet) |
// 'none'.
export async function getAdminStatus(user) {
  if (!user) return 'none';
  let claims = {};
  try {
    claims = (await user.getIdTokenResult()).claims;
  } catch {
    // Fall through with no claims.
  }
  let profile = null;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    profile = snap.exists() ? snap.data() : null;
  } catch {
    // Unreadable profile = treat as no profile.
  }
  if (profile?.disabled) return 'none';
  if (claims.admin === true) return 'admin';
  if (profile?.isAdmin !== true) return 'none';
  if (claims.email_verified === true) return 'admin';
  // The ID token can predate the verification click: reload the user and
  // force a fresh token (Firestore picks the new token up too).
  try {
    await user.reload();
    if (user.emailVerified) {
      const fresh = await user.getIdTokenResult(true);
      if (fresh.claims.email_verified === true) return 'admin';
    }
  } catch {
    // Keep 'unverified'.
  }
  return 'unverified';
}

export async function checkIsAdmin(user) {
  return (await getAdminStatus(user)) === 'admin';
}
