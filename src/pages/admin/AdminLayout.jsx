import { Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/States';
import AdminSidebar from '../../components/nav/AdminSidebar';
import { useAuth } from '../../context/AuthContext';
import { getAdminStatus } from '../../lib/adminAuth';

// No AmbientBackground / backdrop-blur here: solid surfaces keep large
// data tables scrolling at 60fps.

function AdminGate({ children }) {
  const { user, loading, firebaseReady } = useAuth();
  const location = useLocation();
  const [checkingClaim, setCheckingClaim] = useState(true);
  const [status, setStatus] = useState('not-admin');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!firebaseReady || loading || !user) {
      setCheckingClaim(false);
      return;
    }
    let cancelled = false;
    setCheckingClaim(true);
    getAdminStatus(user)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .finally(() => {
        if (!cancelled) setCheckingClaim(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, loading, user, attempt]);

  if (loading) {
    return <LoadingState variant="page" label="Checking admin access…" />;
  }

  // Placeholder mode: no real auth yet, let the admin console render for dev preview.
  if (!firebaseReady) return children;

  if (!user) return <Navigate to="/admin/login" state={{ from: location }} replace />;

  if (checkingClaim) {
    return <LoadingState variant="page" label="Checking admin access…" />;
  }

  // Couldn't read the profile: say so and offer a retry, instead of the
  // "no admin access" redirect a real admin got on a bad connection.
  if (status === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base px-4">
        <ErrorState
          title="Couldn't check admin access"
          description="Check your connection and try again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }

  if (status !== 'admin') {
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
          {/* Page-level Suspense keeps the sidebar on screen while a page's
          code loads (the app-level one would replace the whole screen). */}
          <Suspense fallback={<LoadingState variant="section" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </AdminGate>
  );
}
