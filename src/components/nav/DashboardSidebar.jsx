import { useNavigate } from 'react-router-dom';
import { Bell, LayoutGrid, MessageSquare, Nfc, Package } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerNotifications } from '../../lib/ownerItems';
import SidebarShell from './SidebarShell';

// REDESIGN_PLAN §3.2. Spec calls for 4 items (Dashboard/NFC Setup/Messages/
// Notifications) with My Items folded into Dashboard — that merge is §4.5,
// not done yet, so "My Items" stays as its own item for now rather than
// losing the only route to the real items list. See REDESIGN_CHANGES.md.
export default function DashboardSidebar() {
  const { user, logout, firebaseReady } = useAuth();
  const nav = useNavigate();
  const { unreadCount } = useOwnerNotifications(user);

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
    { to: '/dashboard/items', label: 'My Items', icon: Package },
    { to: '/dashboard/nfc-setup', label: 'NFC Setup', icon: Nfc },
    { to: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
    { to: '/dashboard/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
  ];

  async function onLogout() {
    if (firebaseReady) await logout();
    nav('/');
  }

  return (
    <SidebarShell
      subtitle="NFC Lost & Found"
      homeTo="/dashboard"
      navItems={navItems}
      userLabel={user?.email || 'Signed in'}
      settingsHref="/dashboard/settings"
      onLogout={onLogout}
    />
  );
}
