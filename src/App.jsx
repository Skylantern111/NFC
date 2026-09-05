import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ProtectedRoute from './components/ProtectedRoute';
import { Toaster } from './components/ui/sonner';

// Public — kept eager. These are the first-paint/entry routes (Landing is
// "/", NfcLanding/Chat are hit directly off a physical NFC tap or a shared
// chat link with no prior page load to have already warmed a chunk), so
// splitting them would trade a network round-trip for a bundle-size win
// that doesn't apply here — nobody's shipping the dashboard/admin code to
// them anyway.
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import NfcLanding from './pages/public/NfcLanding';
import Chat from './pages/public/Chat';

// Owner dashboard + Admin console — both gated behind ProtectedRoute (an
// auth check, itself already async), and mutually exclusive audiences: an
// owner never needs the admin bundle, an admin browsing tags/moderation
// rarely needs the owner dashboard's code either. Lazy so neither chunk
// ships to someone who'll never hit those routes (see IMPROVEMENT_PLAN.md
// Round 9 — this was the single 991KB bundle Round 8 kept building).
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Items = lazy(() => import('./pages/dashboard/Items'));
const ClaimTag = lazy(() => import('./pages/dashboard/ClaimTag'));
const NfcSetup = lazy(() => import('./pages/dashboard/NfcSetup'));
const Messages = lazy(() => import('./pages/dashboard/Messages'));
const Notifications = lazy(() => import('./pages/dashboard/Notifications'));
const Settings = lazy(() => import('./pages/dashboard/Settings'));

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Inventory = lazy(() => import('./pages/admin/Inventory'));
const Moderation = lazy(() => import('./pages/admin/Moderation'));
const Owners = lazy(() => import('./pages/admin/Owners'));

// Same loading-screen convention already used by ProtectedRoute/AdminGate
// while they resolve the auth check — a lazy chunk still loading reads the
// same as "waiting on something before this route can render."
function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center gap-2 bg-base text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

export default function App() {
  return (
    <>
    <Toaster position="top-center" richColors closeButton />
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/nfc/:tagId" element={<NfcLanding />} />
      <Route path="/chat/:chatId" element={<Chat />} />

      {/* Owner (protected) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="items" element={<Items />} />
        <Route path="items/claim" element={<ClaimTag />} />
        <Route path="nfc-setup" element={<NfcSetup />} />
        <Route path="messages" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Admin (protected) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="inventory" replace />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="moderation" element={<Moderation />} />
        <Route path="owners" element={<Owners />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </>
  );
}
