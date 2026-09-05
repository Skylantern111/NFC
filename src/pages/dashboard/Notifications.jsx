import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageSquare, PackageSearch, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useOwnerNotificationsContext } from '../../context/OwnerNotificationsContext';
import {
  useOwnerItems,
  useOwnerChats,
  markNotificationRead,
  markAllNotificationsRead,
  clearReadNotifications,
} from '../../lib/ownerItems';
import { relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

const glass = 'bg-white/70 dark:bg-white/5 backdrop-blur-xl rounded-3xl';

const TYPE_META = {
  report: { icon: PackageSearch, label: 'Someone found your item' },
  message: { icon: MessageSquare, label: 'New message' },
  // Written by admin/Moderation.jsx's onToggleBan — closes the loop on a
  // chat the owner reported (lib/ownerItems.js#reportChat) once an admin
  // acts on it.
  moderation_resolved: { icon: ShieldCheck, label: 'Your report was reviewed' },
};

export default function Notifications() {
  const { user } = useAuth();
  const { notifications, unreadCount, loading: notifLoading } = useOwnerNotificationsContext();
  const { items, loading: itemsLoading } = useOwnerItems(user);
  const { chats } = useOwnerChats(user);
  const loading = notifLoading || itemsLoading;

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);
  const chatByTag = useMemo(() => Object.fromEntries(chats.map((c) => [c.tagId, c])), [chats]);

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
    } catch {
      // Best-effort — the feed will just still show unread items to retry.
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
      toast.error('Could not clear notifications: ' + err.message);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {unreadCount > 0 ? `You have ${unreadCount} new alert${unreadCount === 1 ? '' : 's'}.` : "You're all caught up."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={onMarkAllRead} disabled={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </Button>
          )}
          {readCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearRead} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Clear read'}
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-3xl" />
          ))}
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <Card className={glass}>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/5 dark:bg-white/5">
              <Bell className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            </span>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100">No notifications yet.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                You'll be alerted here when someone finds your item or sends a message.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {notifications.length > 0 && (
        <Card className={glass}>
          <CardContent className="divide-y divide-slate-200/70 p-0">
            {notifications.map((n) => {
              const meta = TYPE_META[n.type] || TYPE_META.message;
              const Icon = meta.icon;
              const item = itemsByTag[n.tagId];
              const chat = chatByTag[n.tagId];
              return (
                <Link
                  key={n.id}
                  to={chat ? `/chat/${chat.id}` : '/dashboard/messages'}
                  onClick={() => onOpenNotification(n)}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-900/5 dark:hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900/5 dark:bg-white/5">
                      <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{meta.label}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {item?.itemName || 'One of your items'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {relativeTimeFromMs(toMillis(n.createdAt))}
                    </span>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-purple-400" />}
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
