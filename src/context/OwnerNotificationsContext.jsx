import { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useOwnerChats, useOwnerNotifications } from '../lib/ownerItems';
import { setTitleBadge } from '../lib/pageTitle';

const OwnerNotificationsContext = createContext(null);

// A chat is unread for the owner while 'owner' is in its unreadFor.
export function isChatUnreadForOwner(chat) {
  return Array.isArray(chat.unreadFor) ? chat.unreadFor.includes('owner') : chat.unreadFor === 'owner';
}

// One notifications listener and one chats listener, shared by the nav
// badges and every owner page under DashboardLayout, instead of each
// mounting its own.
//
// UI_UX_IMPROVEMENT_PLAN.md NAV3: Messages is the inbox, so the one number
// badge is unread chats; unread notifications only get a dot on Alerts.
export function OwnerNotificationsProvider({ children }) {
  const { user } = useAuth();
  const notifications = useOwnerNotifications(user);
  const chats = useOwnerChats(user);
  const unreadChatCount = useMemo(() => chats.chats.filter(isChatUnreadForOwner).length, [chats.chats]);

  // §R2.5 — a nav badge is invisible from a background tab.
  useEffect(() => {
    setTitleBadge(unreadChatCount);
    return () => setTitleBadge(0);
  }, [unreadChatCount]);

  const value = useMemo(
    () => ({
      ...notifications,
      chats: chats.chats,
      chatsLoading: chats.loading,
      chatsError: chats.error,
      retryChats: chats.retry,
      unreadChatCount,
    }),
    [notifications, chats.chats, chats.loading, chats.error, chats.retry, unreadChatCount]
  );

  return <OwnerNotificationsContext.Provider value={value}>{children}</OwnerNotificationsContext.Provider>;
}

export function useOwnerNotificationsContext() {
  const ctx = useContext(OwnerNotificationsContext);
  if (!ctx) throw new Error('useOwnerNotificationsContext must be used within OwnerNotificationsProvider');
  return ctx;
}
