import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { Toaster } from './components/ui/sonner';

// Public
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import NfcLanding from './pages/public/NfcLanding';
import Chat from './pages/public/Chat';

// Owner dashboard
import DashboardLayout from './pages/dashboard/DashboardLayout';
import Dashboard from './pages/dashboard/Dashboard';
import Items from './pages/dashboard/Items';
import ClaimTag from './pages/dashboard/ClaimTag';
import NfcSetup from './pages/dashboard/NfcSetup';
import Messages from './pages/dashboard/Messages';
import Notifications from './pages/dashboard/Notifications';
import Settings from './pages/dashboard/Settings';

// Admin
import AdminLayout from './pages/admin/AdminLayout';
import Inventory from './pages/admin/Inventory';
import Moderation from './pages/admin/Moderation';

export default function App() {
  return (
    <>
    <Toaster position="top-center" richColors closeButton />
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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
