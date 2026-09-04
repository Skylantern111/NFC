import { useNavigate } from 'react-router-dom';
import { Boxes, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import SidebarShell from './SidebarShell';

// REDESIGN_PLAN §3.3 — no admin mockup was supplied, this mirrors the owner
// sidebar shell for consistency. Solid, non-blurred surface (no
// backdrop-blur) to match AdminLayout's existing "ops console" perf note.
// Analytics (§4.14) isn't built yet, so it's left off rather than 404ing.
const navItems = [
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/moderation', label: 'Moderation', icon: ShieldAlert },
];

export default function AdminSidebar() {
  const { user, logout, firebaseReady } = useAuth();
  const nav = useNavigate();

  async function onLogout() {
    if (firebaseReady) await logout();
    nav('/');
  }

  return (
    <SidebarShell
      subtitle="Admin console"
      homeTo="/admin/inventory"
      navItems={navItems}
      userLabel={user?.email || 'Signed in'}
      onLogout={onLogout}
    />
  );
}
