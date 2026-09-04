import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, LayoutGrid, LogOut, MessageSquare, Nfc, Package, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerNotifications } from '../../lib/ownerItems';

// REDESIGN_PLAN §3.2. Spec calls for 4 items (Dashboard/NFC Setup/Messages/
// Notifications) with My Items folded into Dashboard — that merge is §4.5,
// not done yet, so "My Items" stays as its own item for now rather than
// losing the only route to the real items list. See REDESIGN_CHANGES.md.
const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/dashboard/items', label: 'My Items', icon: Package },
  { to: '/dashboard/nfc-setup', label: 'NFC Setup', icon: Nfc },
  { to: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
];

export default function DashboardSidebar() {
  const { user, logout, firebaseReady } = useAuth();
  const nav = useNavigate();
  const { unreadCount } = useOwnerNotifications(user);

  async function onLogout() {
    if (firebaseReady) await logout();
    nav('/');
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-56 shrink-0 flex-col border-r border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <Link to="/dashboard" className="flex items-center gap-2.5 px-5 py-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
          <Tag className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold leading-tight text-white">TagBack</p>
          <p className="truncate text-xs text-slate-400">NFC Lost &amp; Found</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {to === '/dashboard/notifications' && unreadCount > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-1 text-[11px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <Link
          to="/dashboard/settings"
          className="block truncate rounded-xl px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          title="Account settings"
        >
          {user?.email || 'Signed in'}
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
