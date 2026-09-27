import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { auth, db, firebaseReady } from '../firebase/config';

const AuthContext = createContext({ user: null, loading: true, logout: () => {} });

// Set by auth/Register.jsx while it creates the account + users/{uid} doc,
// so the "missing profile" repair below doesn't race it and create the doc
// first (which would turn Register's admin-grant create into a rejected
// update).
export const signupInProgress = { current: false };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) {
      // No real Firebase yet: don't hang on the auth listener.
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // An admin can soft-disable an owner account (admin/Owners.jsx). There's
  // no Cloud Functions/Admin SDK here to revoke an already-open session, so
  // this is the enforcement for that case: watch our own users/{uid} doc and
  // force a sign-out the moment `disabled` flips true, instead of leaving a
  // disabled account logged in until its writes start failing confusingly.
  useEffect(() => {
    if (!firebaseReady || !user) return;
    let repaired = false;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists() && snap.data().disabled) {
        toast.error('This account has been disabled.');
        signOut(auth);
        return;
      }
      // SYSTEM_AUDIT_PLAN.md B8: if signup created the Auth account but the
      // users/{uid} write failed (network), every later profile write
      // (Settings, nudge dismissals) failed with it. Create a plain, non-admin
      // profile once. Skipped from the cache-only first snapshot, where a
      // missing doc may just not be loaded yet.
      if (!snap.exists() && !snap.metadata.fromCache && !repaired && !signupInProgress.current) {
        repaired = true;
        setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          phone: '',
          notificationPrefs: { inApp: true, email: true },
          isAdmin: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    });
    return unsub;
  }, [user]);

  const logout = () => signOut(auth);

  // Settings.jsx's "I've verified — refresh status" button. `user.reload()`
  // mutates the Firebase User instance in place (emailVerified included) but
  // keeps the same object reference, so a plain `setUser(auth.currentUser)`
  // wouldn't re-render anything reading it. Cloning onto a new object with
  // the same prototype gives React a changed reference while keeping every
  // method (getIdTokenResult, etc.) callable via the prototype chain.
  async function refreshUser() {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setUser(Object.assign(Object.create(Object.getPrototypeOf(auth.currentUser)), auth.currentUser));
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, firebaseReady, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
