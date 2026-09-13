import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Mirrors firestore.rules#isAdmin(): a user is admin via the real custom
// claim (scripts/setAdmin.js) OR a self-serve `users/{uid}.isAdmin` flag set
// at signup through a passcode (see Register.jsx). Checked in one place so
// AdminLayout/AdminLogin/Chat.jsx can't drift on what "admin" means.
export async function checkIsAdmin(user) {
  if (!user) return false;
  try {
    const token = await user.getIdTokenResult();
    if (token.claims.admin === true) return true;
  } catch {
    // Fall through to the Firestore check below.
  }
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() && snap.data().isAdmin === true;
  } catch {
    return false;
  }
}
