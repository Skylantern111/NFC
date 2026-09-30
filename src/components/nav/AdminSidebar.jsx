import { useNavigate } from 'react-router-dom';
import { Boxes, Nfc, PencilLine, Settings, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import SidebarShell from './SidebarShell';

// REDESIGN_PLAN §3.3 — mirrors the owner sidebar shell for consistency
// (design system §14), with `admin` on SidebarShell giving it a small
// amber-accented identity distinct from the low-stakes owner console it's
// structurally copied from (IMPROVEMENT_PLAN.md Round 7 #7). Solid,
// non-blurred surface (no) to match AdminLayout's existing
// "ops console" perf note. Analytics (§4.14) isn't built yet, so it's left
// off rather than 404ing.
const navItems = [
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/nfc-register', label: 'NFC Register', icon: Nfc },
  { to: '/admin/tags', label: 'Tag Content', icon: PencilLine },
  { to: '/admin/moderation', label: 'Moderation', icon: ShieldAlert },
  { to: '/admin/owners', label: 'Owners', icon: Users },
  // Errors moved into Settings › Maintenance to keep the daily list short.
  { to: '/admin/settings', label: 'Settings', icon: Settings },
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
      admin
      tourId="admin-nav"
    />
  );
}
