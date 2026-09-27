import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Mirrors firestore.rules#isAdmin() so AdminLayout/AdminLogin/Chat.jsx can't
// drift on what "admin" means:
//   - never when users/{uid}.disabled (SYSTEM_AUDIT_ROUND2.md A2)
//   - the real custom claim (scripts/setAdmin.js), or
//   - the self-serve users/{uid}.isAdmin flag (admin signup passcode).
export async function checkIsAdmin(user) {
  if (!user) return false;
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
  if (profile?.disabled) return false;
  return claims.admin === true || profile?.isAdmin === true;
}
