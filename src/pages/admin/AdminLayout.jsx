import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from '../../components/nav/AdminSidebar';
import { useAuth } from '../../context/AuthContext';

// No AmbientBackground / backdrop-blur here: solid surfaces keep large
// data tables scrolling at 60fps.

function AdminGate({ children }) {
  const { user, loading, firebaseReady } = useAuth();
  const location = useLocation();
  const [checkingClaim, setCheckingClaim] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!firebaseReady || loading || !user) {
      setCheckingClaim(false);
      return;
    }
    let cancelled = false;
    setCheckingClaim(true);
    user
      .getIdTokenResult()
      .then((token) => {
        if (!cancelled) setIsAdmin(token.claims.admin === true);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingClaim(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, loading, user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-base text-slate-500">
        Loading…
      </div>
    );
  }

  // Placeholder mode: no real auth yet, let the admin console render for dev preview.
  if (!firebaseReady) return children;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (checkingClaim) {
    return (
      <div className="flex h-screen items-center justify-center bg-base text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}

export default function AdminLayout() {
  return (
    <AdminGate>
      <div className="min-h-screen bg-base">
        <AdminSidebar />
        <div className="ml-56 px-6 py-8 sm:px-8">
          <Outlet />
        </div>
      </div>
    </AdminGate>
  );
}
