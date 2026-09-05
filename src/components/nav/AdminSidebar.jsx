import { useNavigate } from 'react-router-dom';
import { Boxes, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import SidebarShell from './SidebarShell';

// REDESIGN_PLAN §3.3 — mirrors the owner sidebar shell for consistency
// (design system §14), with `admin` on SidebarShell giving it a small
// amber-accented identity distinct from the low-stakes owner console it's
// structurally copied from (IMPROVEMENT_PLAN.md Round 7 #7). Solid,
// non-blurred surface (no backdrop-blur) to match AdminLayout's existing
// "ops console" perf note. Analytics (§4.14) isn't built yet, so it's left
// off rather than 404ing.
const navItems = [
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/moderation', label: 'Moderation', icon: ShieldAlert },
  { to: '/admin/owners', label: 'Owners', icon: Users },
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
    />
  );
}
