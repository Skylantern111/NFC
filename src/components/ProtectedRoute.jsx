import { Navigate, useLocation } from 'react-router-dom';
import { LoadingState } from './States';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading, firebaseReady } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState variant="page" label="Checking your sign-in…" />;
  }

  // Placeholder mode: no real auth yet, let dashboards render for dev preview.
  if (!firebaseReady) return children;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}
