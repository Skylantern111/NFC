import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { auth, db, firebaseReady } from '../firebase/config';

const AuthContext = createContext({ user: null, loading: true, logout: () => {} });

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
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists() && snap.data().disabled) {
        toast.error('This account has been disabled.');
        signOut(auth);
      }
    });
    return unsub;
  }, [user]);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, logout, firebaseReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
