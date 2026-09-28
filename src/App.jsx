import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { Toaster } from './components/ui/sonner';
import OfflineBanner from './components/OfflineBanner';
import { LoadingState } from './components/States';

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
// A lazy route that can also be fetched ahead of time. The first visit to
// a lazy page used to swap the whole screen for the loading screen while
// its code downloaded, which looked like a full page reload.
function lazyPage(loader) {
  const Page = lazy(loader);
  Page.preload = loader;
  return Page;
}

const DashboardLayout = lazyPage(() => import('./pages/dashboard/DashboardLayout'));
const Dashboard = lazyPage(() => import('./pages/dashboard/Dashboard'));
const Items = lazyPage(() => import('./pages/dashboard/Items'));
const ClaimTag = lazyPage(() => import('./pages/dashboard/ClaimTag'));
const NfcSetup = lazyPage(() => import('./pages/dashboard/NfcSetup'));
const Messages = lazyPage(() => import('./pages/dashboard/Messages'));
const Notifications = lazyPage(() => import('./pages/dashboard/Notifications'));
const Settings = lazyPage(() => import('./pages/dashboard/Settings'));
const VerifyEmail = lazyPage(() => import('./pages/dashboard/VerifyEmail'));

const AdminLayout = lazyPage(() => import('./pages/admin/AdminLayout'));
const AdminLogin = lazyPage(() => import('./pages/admin/AdminLogin'));
const AdminRegister = lazyPage(() => import('./pages/admin/AdminRegister'));
const Inventory = lazyPage(() => import('./pages/admin/Inventory'));
const NfcRegister = lazyPage(() => import('./pages/admin/NfcRegister'));
const Moderation = lazyPage(() => import('./pages/admin/Moderation'));
const Owners = lazyPage(() => import('./pages/admin/Owners'));
const TagContent = lazyPage(() => import('./pages/admin/TagContent'));
const TagContentIndex = lazyPage(() => import('./pages/admin/TagContentIndex'));
const Errors = lazyPage(() => import('./pages/admin/Errors'));
const AdminSettings = lazyPage(() => import('./pages/admin/Settings'));
const Privacy = lazyPage(() => import('./pages/Privacy'));

// Same loading-screen convention already used by ProtectedRoute/AdminGate
// while they resolve the auth check — a lazy chunk still loading reads the
// same as "waiting on something before this route can render."
function RouteFallback() {
  return <LoadingState variant="page" />;
}

const OWNER_PAGES = [Dashboard, Items, ClaimTag, NfcSetup, Messages, Notifications, Settings, VerifyEmail];
const ADMIN_PAGES = [Inventory, NfcRegister, Moderation, Owners, TagContentIndex, TagContent, AdminSettings, Errors];

// Once someone is inside the dashboard or admin console, download the rest
// of that area's pages while the browser is idle, so later clicks switch
// instantly instead of waiting on a network fetch.
function usePreloadArea() {
  const { pathname } = useLocation();
  const area = pathname.startsWith('/dashboard')
    ? 'owner'
    : pathname.startsWith('/admin') && !/^\/admin\/(login|register)/.test(pathname)
      ? 'admin'
      : null;
  useEffect(() => {
    if (!area) return;
    const pages = area === 'owner' ? OWNER_PAGES : ADMIN_PAGES;
    const run = () => pages.forEach((p) => p.preload().catch(() => {}));
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 1500);
    return () => clearTimeout(id);
  }, [area]);
}

export default function App() {
  usePreloadArea();
  return (
    <>
    <Toaster position="top-center" richColors closeButton />
    <OfflineBanner />
    <RouteErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/nfc/:tagId" element={<NfcLanding />} />
      <Route path="/chat/:chatId" element={<Chat />} />
      <Route path="/privacy" element={<Privacy />} />

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
        <Route path="verify-email" element={<VerifyEmail />} />
      </Route>

      {/* Admin */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/register" element={<AdminRegister />} />
      <Route
        path="/admin"
        // No ProtectedRoute here (SYSTEM_AUDIT_ROUND2.md B4): AdminLayout's
        // AdminGate sends signed-out users to /admin/login itself;
        // ProtectedRoute sent them to the owner /login instead.
        element={<AdminLayout />}
      >
        <Route index element={<Navigate to="inventory" replace />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="nfc-register" element={<NfcRegister />} />
        <Route path="moderation" element={<Moderation />} />
        <Route path="owners" element={<Owners />} />
        <Route path="tags" element={<TagContentIndex />} />
        <Route path="tags/:tagId" element={<TagContent />} />
        <Route path="errors" element={<Errors />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </RouteErrorBoundary>
    </>
  );
}
