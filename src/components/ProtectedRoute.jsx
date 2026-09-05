import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading, firebaseReady } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 bg-base text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  // Placeholder mode: no real auth yet, let dashboards render for dev preview.
  if (!firebaseReady) return children;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}
