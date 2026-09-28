import { useNavigate } from 'react-router-dom';
import { Bell, LayoutGrid, MessageSquare, Package, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerNotificationsContext } from '../../context/OwnerNotificationsContext';
import SidebarShell from './SidebarShell';

// Owner navigation. UI_UX_IMPROVEMENT_PLAN.md NAV2: "NFC Setup" is no
// longer a top-level item (it needs a tag to mean anything) — each item on
// My Items links to its tap page instead. NAV3: the number badge is unread
// chats on Messages; Notifications gets a dot.
export function useOwnerNavItems() {
  const { unreadChatCount, unreadCount } = useOwnerNotificationsContext();
  return [
    { to: '/dashboard', label: 'Home', icon: LayoutGrid, end: true },
    { to: '/dashboard/items', label: 'My Items', icon: Package },
    { to: '/dashboard/messages', label: 'Messages', icon: MessageSquare, badge: unreadChatCount },
    { to: '/dashboard/notifications', label: 'Notifications', icon: Bell, dot: unreadCount > 0 },
    { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];
}

export default function DashboardSidebar() {
  const { user, logout, firebaseReady } = useAuth();
  const nav = useNavigate();
  const navItems = useOwnerNavItems();

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
      onLogout={onLogout}
    />
  );
}
