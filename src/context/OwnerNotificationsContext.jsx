import { createContext, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useOwnerNotifications } from '../lib/ownerItems';

const OwnerNotificationsContext = createContext(null);

const BASE_TITLE = document.title;

// Single onSnapshot listener shared by DashboardSidebar (unread badge) and
// Notifications.jsx (full list) instead of each mounting its own — both are
// mounted together under DashboardLayout whenever any dashboard page is open.
export function OwnerNotificationsProvider({ children }) {
  const { user } = useAuth();
  const value = useOwnerNotifications(user);

  // §R2.5 — a badge in the sidebar is invisible from a background tab.
  // No other page in this app ever sets document.title, so this can't
  // clobber anything — restored on unmount so it doesn't leak past a
  // sign-out into a page that never wanted a badge.
  useEffect(() => {
    document.title = value.unreadCount > 0 ? `(${value.unreadCount}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [value.unreadCount]);

  return <OwnerNotificationsContext.Provider value={value}>{children}</OwnerNotificationsContext.Provider>;
}

export function useOwnerNotificationsContext() {
  const ctx = useContext(OwnerNotificationsContext);
  if (!ctx) throw new Error('useOwnerNotificationsContext must be used within OwnerNotificationsProvider');
  return ctx;
}
