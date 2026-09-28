import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, MessageSquare, MoreVertical, PackageSearch, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useOwnerNotificationsContext } from '../../context/OwnerNotificationsContext';
import {
  useOwnerItems,
  markNotificationRead,
  markAllNotificationsRead,
  clearReadNotifications,
} from '../../lib/ownerItems';
import { cn, friendlyFirestoreError, relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import PageHeader from '../../components/PageHeader';
import { EmptyState, SkeletonList } from '../../components/States';

const TYPE_META = {
  report: { icon: PackageSearch, label: 'Someone found your item' },
  message: { icon: MessageSquare, label: 'New message' },
  // Written by admin/Moderation.jsx's onToggleBan — closes the loop on a
  // chat the owner reported (lib/ownerItems.js#reportChat).
  moderation_resolved: { icon: ShieldCheck, label: 'Your report was reviewed' },
};

// Activity log (UI_UX_IMPROVEMENT_PLAN.md NAV3) — Messages is the inbox.
export default function Notifications() {
  const { user } = useAuth();
  const { notifications, unreadCount, loading: notifLoading, chats } = useOwnerNotificationsContext();
  const { items, loading: itemsLoading } = useOwnerItems(user);
  const loading = notifLoading || itemsLoading;

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);
  // Fallback only, for old notifications without a chatId: the most recent
  // chat on that tag (chats come newest-first; keep the first per tag).
  const latestChatByTag = useMemo(() => {
    const out = {};
    for (const c of chats) if (!out[c.tagId]) out[c.tagId] = c;
    return out;
  }, [chats]);

  const [markingAll, setMarkingAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const readCount = useMemo(() => notifications.filter((n) => n.read).length, [notifications]);

  function onOpenNotification(n) {
    if (n.read) return;
    markNotificationRead(n.id).catch(() => {});
  }

  async function onMarkAllRead() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(notifications.filter((n) => !n.read).map((n) => n.id));
      toast.success('All marked as read.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not mark all as read. Try again.'));
    } finally {
      setMarkingAll(false);
    }
  }

  async function onClearRead() {
    setClearing(true);
    try {
      await clearReadNotifications(notifications.filter((n) => n.read).map((n) => n.id));
      toast.success('Cleared read notifications.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not clear notifications. Try again.'));
    } finally {
      setClearing(false);
    }
  }

  // OWN3: on phones the two header actions live in one ⋯ menu.
  const actions =
    unreadCount > 0 || readCount > 0 ? (
      <>
        <div className="hidden gap-2 sm:flex">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={onMarkAllRead} loading={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </Button>
          )}
          {readCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearRead} loading={clearing}>
              {clearing ? 'Clearing…' : 'Clear read'}
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Notification actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {unreadCount > 0 && (
              <DropdownMenuItem onSelect={onMarkAllRead} disabled={markingAll}>
                <CheckCheck className="h-4 w-4" /> Mark all as read
              </DropdownMenuItem>
            )}
            {readCount > 0 && (
              <DropdownMenuItem onSelect={onClearRead} disabled={clearing}>
                <Trash2 className="h-4 w-4" /> Clear read
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} new.` : "You're all caught up."}
        actions={actions}
      />

      {loading && <SkeletonList count={3} className="h-16" />}

      {!loading && notifications.length === 0 && (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You'll see an alert here when someone finds your item or sends a message."
        />
      )}

      {!loading && notifications.length > 0 && (
        <ul className="glass divide-y divide-slate-200/70 dark:divide-white/10 overflow-hidden p-0">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.message;
            const Icon = meta.icon;
            const item = itemsByTag[n.tagId];
            // SYSTEM_AUDIT_ROUND2.md B1: open the chat this notification is
            // about, not whichever chat happens to share its tag.
            const chatId = n.chatId || latestChatByTag[n.tagId]?.id;
            return (
              <li key={n.id}>
                <Link
                  to={chatId ? `/chat/${chatId}` : '/dashboard/messages'}
                  onClick={() => onOpenNotification(n)}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-900/5 dark:hover:bg-white/5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900/5 dark:bg-white/5">
                    <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm text-slate-800 dark:text-slate-100',
                        n.read ? 'font-medium' : 'font-bold'
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-600 dark:text-slate-400">
                      {item?.itemName || 'One of your items'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {relativeTimeFromMs(toMillis(n.createdAt))}
                    </span>
                    {!n.read && (
                      <span className="h-2.5 w-2.5 rounded-full bg-pink-600">
                        <span className="sr-only">Unread</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
