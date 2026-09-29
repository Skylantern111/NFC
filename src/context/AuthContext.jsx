import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { auth, db, firebaseReady } from '../firebase/config';
import { refreshVerified } from '../lib/emailVerification';

const AuthContext = createContext({ user: null, loading: true, logout: () => {} });

// Pauses the "missing profile" repair below. Set by components/SignupForm.jsx
// while it creates the account + users/{uid} doc (so the repair can't create
// the doc first and turn the admin-grant create into a rejected update), and
// by lib/account.js#deleteMyAccount (so a just-deleted profile isn't
// re-created before the Auth account itself is deleted).
export const profileRepairPaused = { current: false };

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
      if (!snap.exists() && !snap.metadata.fromCache && !repaired && !profileRepairPaused.current) {
        repaired = true;
        setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          notificationPrefs: { inApp: true, email: true },
          isAdmin: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
        return;
      }
      // EMAIL_OWNERSHIP_PLAN.md §3/§4: once verified, keep the profile in
      // step with the sign-in account — the new address after a "Wrong
      // email? Change it" switch (the rules only accept the login's own
      // email, SYSTEM_AUDIT_ROUND4 B1), and the emailVerified flag admins
      // see in admin/Owners.jsx. Best-effort; retried on the next snapshot.
      if (snap.exists() && user.emailVerified && user.email) {
        const data = snap.data();
        const patch = {};
        if (data.email !== user.email) patch.email = user.email;
        if (data.emailVerified !== true) patch.emailVerified = true;
        if (Object.keys(patch).length) updateDoc(snap.ref, patch).catch(() => {});
      }
    });
    return unsub;
  }, [user]);

  const logout = () => signOut(auth);

  // Re-checks email verification (lib/emailVerification.js#refreshVerified
  // also refreshes the ID token so the rules see it). `user.reload()`
  // mutates the Firebase User instance in place (emailVerified included) but
  // keeps the same object reference, so a plain `setUser(auth.currentUser)`
  // wouldn't re-render anything reading it. Cloning onto a new object with
  // the same prototype gives React a changed reference while keeping every
  // method (getIdTokenResult, etc.) callable via the prototype chain.
  // Only re-renders when the status actually changed, since
  // useVerificationWatch calls this every few seconds.
  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return false;
    const before = auth.currentUser.emailVerified;
    const verified = await refreshVerified();
    if (verified !== before) {
      setUser(Object.assign(Object.create(Object.getPrototypeOf(auth.currentUser)), auth.currentUser));
    }
    return verified;
  }, []);

  // After updateProfile() (Settings → Name): the SDK changes the User in
  // place, so give React a new object to re-render names shown elsewhere.
  const refreshProfile = useCallback(() => {
    if (!auth.currentUser) return;
    setUser(Object.assign(Object.create(Object.getPrototypeOf(auth.currentUser)), auth.currentUser));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, firebaseReady, refreshUser, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

const WATCH_EVERY_MS = 5000;
const WATCH_FOR_MS = 10 * 60 * 1000;

// While an owner's email is unverified, notice the moment they click the
// link (usually in another tab or the mail app): check every 5 s while this
// tab is visible, for up to 10 minutes, and again whenever the tab regains
// focus. Used by the owner dashboard and the admin verify page.
export function useVerificationWatch() {
  const { user, refreshUser } = useAuth();
  const waiting = firebaseReady && !!user && !user.emailVerified;
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      refreshUser().catch(() => {});
    };
    const id = setInterval(() => {
      if (Date.now() - started > WATCH_FOR_MS) clearInterval(id);
      else check();
    }, WATCH_EVERY_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [waiting, refreshUser]);
}
