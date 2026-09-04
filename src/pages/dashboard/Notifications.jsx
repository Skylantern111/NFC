import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageSquare, PackageSearch } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerItems, useOwnerNotifications, markNotificationRead } from '../../lib/ownerItems';
import { Card, CardContent } from '../../components/ui/card';

const glass = 'border-white/10 bg-white/5 backdrop-blur-xl';

function relativeTime(timestamp) {
  const ms = timestamp?.toMillis ? timestamp.toMillis() : null;
  if (!ms) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

const TYPE_META = {
  report: { icon: PackageSearch, label: 'Someone found your item' },
  message: { icon: MessageSquare, label: 'New message' },
};

// REDESIGN_PLAN §4.9. Backed by the `notifications` collection (tagId-keyed,
// same join pattern as Messages.jsx — see firestore.rules and
// lib/ownerItems.js#useOwnerNotifications for why it isn't ownerUid-keyed).
export default function Notifications() {
  const { user } = useAuth();
  const { items } = useOwnerItems(user);
  const { notifications, unreadCount, loading } = useOwnerNotifications(user);

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold drop-shadow-md">Notifications</h1>
        <p className="mt-1 text-sm text-slate-400">
          {unreadCount > 0 ? `You have ${unreadCount} new alert${unreadCount === 1 ? '' : 's'}.` : "You're all caught up."}
        </p>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading notifications…</p>}

      {!loading && notifications.length === 0 && (
        <Card className={glass}>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <Bell className="h-6 w-6 text-slate-300" />
            </span>
            <div>
              <p className="font-bold text-white">No notifications yet.</p>
              <p className="mt-1 text-sm text-slate-400">
                You'll be alerted here when someone finds your item or sends a message.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {notifications.length > 0 && (
        <Card className={glass}>
          <CardContent className="divide-y divide-white/10 p-0">
            {notifications.map((n) => {
              const meta = TYPE_META[n.type] || TYPE_META.message;
              const Icon = meta.icon;
              const item = itemsByTag[n.tagId];
              return (
                <Link
                  key={n.id}
                  to={n.chatId ? `/chat/${n.chatId}` : '/dashboard/messages'}
                  onClick={() => !n.read && markNotificationRead(n.id).catch(() => {})}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <Icon className="h-4 w-4 text-slate-300" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{meta.label}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {item?.itemName || 'One of your items'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-500">{relativeTime(n.createdAt)}</span>
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
