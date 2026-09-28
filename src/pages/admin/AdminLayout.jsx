import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '../../components/States';
import AdminSidebar from '../../components/nav/AdminSidebar';
import { useAuth } from '../../context/AuthContext';
import { checkIsAdmin } from '../../lib/adminAuth';

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
    checkIsAdmin(user)
      .then((result) => {
        if (!cancelled) setIsAdmin(result);
      })
      .finally(() => {
        if (!cancelled) setCheckingClaim(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, loading, user]);

  if (loading) {
    return <LoadingState variant="page" label="Checking admin access…" />;
  }

  // Placeholder mode: no real auth yet, let the admin console render for dev preview.
  if (!firebaseReady) return children;

  if (!user) return <Navigate to="/admin/login" state={{ from: location }} replace />;

  if (checkingClaim) {
    return <LoadingState variant="page" label="Checking admin access…" />;
  }

  if (!isAdmin) {
    return (
      <Navigate
        to="/admin/login"
        state={{ from: location, notice: 'Your account does not have admin access.' }}
        replace
      />
    );
  }

  return children;
}

export default function AdminLayout() {
  return (
    <AdminGate>
      <div className="min-h-screen bg-base">
        <AdminSidebar />
        <main id="main" tabIndex={-1} className="px-4 py-6 outline-none sm:px-8 sm:py-8 md:ml-56">
          <Outlet />
        </main>
      </div>
    </AdminGate>
  );
}
