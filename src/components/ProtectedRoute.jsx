import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading, firebaseReady } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  // Placeholder mode: no real auth yet, let dashboards render for dev preview.
  if (!firebaseReady) return children;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}
