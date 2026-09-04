import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useOwnerNotifications } from '../lib/ownerItems';

const OwnerNotificationsContext = createContext(null);

// Single onSnapshot listener shared by DashboardSidebar (unread badge) and
// Notifications.jsx (full list) instead of each mounting its own — both are
// mounted together under DashboardLayout whenever any dashboard page is open.
export function OwnerNotificationsProvider({ children }) {
  const { user } = useAuth();
  const value = useOwnerNotifications(user);
  return <OwnerNotificationsContext.Provider value={value}>{children}</OwnerNotificationsContext.Provider>;
}

export function useOwnerNotificationsContext() {
  const ctx = useContext(OwnerNotificationsContext);
  if (!ctx) throw new Error('useOwnerNotificationsContext must be used within OwnerNotificationsProvider');
  return ctx;
}
