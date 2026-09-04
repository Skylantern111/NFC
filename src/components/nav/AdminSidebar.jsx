import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Boxes, LogOut, ShieldAlert, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
    <aside className="fixed inset-y-0 left-0 z-20 flex w-56 shrink-0 flex-col bg-base shadow-neu-flat">
      <Link to="/admin/inventory" className="flex items-center gap-2.5 px-5 py-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-neu-flat-sm">
          <Tag className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold leading-tight text-slate-800">TagBack</p>
          <p className="truncate text-xs text-slate-500">Admin console</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-1.5 px-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-base text-purple-600 shadow-neu-pressed-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4">
        <p className="truncate rounded-xl px-3 py-2 text-xs text-slate-500">{user?.email || 'Signed in'}</p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-red-500"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
