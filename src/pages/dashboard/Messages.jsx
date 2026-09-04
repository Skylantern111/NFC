import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerChats, useOwnerItems, useOwnerOpenReports, markChatRead } from '../../lib/ownerItems';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

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

// REDESIGN_PLAN §4.8. "My chats" is a join (itemOwners-derived tagIds against
// chats.tagId) rather than a chats.ownerUid field — see the note on
// lib/ownerItems.js#useOwnerChats and firestore.rules for why.
export default function Messages() {
  const { user } = useAuth();
  const { items } = useOwnerItems(user);
  const tagIds = useMemo(() => items.map((i) => i.tagId), [items]);
  const { chats, loading } = useOwnerChats(user);
  const { reports: openReports } = useOwnerOpenReports(tagIds);

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);
  const openReportIds = useMemo(() => new Set(openReports.map((r) => r.id)), [openReports]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold drop-shadow-md">Messages</h1>
        <p className="mt-1 text-sm text-slate-400">Conversations with people who found your items.</p>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading conversations…</p>}

      {!loading && chats.length === 0 && (
        <Card className={glass}>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <MessageSquare className="h-6 w-6 text-slate-300" />
            </span>
            <div>
              <p className="font-bold text-white">No conversations yet.</p>
              <p className="mt-1 text-sm text-slate-400">
                When someone reports finding your item, the chat will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {chats.length > 0 && (
        <Card className={glass}>
          <CardContent className="divide-y divide-white/10 p-0">
            {chats.map((chat) => {
              const item = itemsByTag[chat.tagId];
              const unread = chat.unreadFor?.includes('owner');
              const resolved = chat.reportId ? !openReportIds.has(chat.reportId) : false;
              return (
                <Link
                  key={chat.id}
                  to={`/chat/${chat.id}`}
                  onClick={() => markChatRead(chat.id, 'owner').catch(() => {})}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <MessageSquare className="h-4 w-4 text-slate-300" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {item?.itemName || 'Unknown item'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {chat.lastMessageText || 'No messages yet.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs text-slate-500">{relativeTime(chat.lastMessageAt)}</span>
                    <div className="flex items-center gap-1.5">
                      {unread && <span className="h-2 w-2 rounded-full bg-purple-400" />}
                      <Badge variant={resolved ? 'secondary' : 'outline'} className="border-white/20 text-slate-300">
                        {resolved ? 'Resolved' : 'Open'}
                      </Badge>
                    </div>
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
