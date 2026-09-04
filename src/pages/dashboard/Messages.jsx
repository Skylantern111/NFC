import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerChats, useOwnerItems, markChatRead } from '../../lib/ownerItems';
import { relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

const glass = 'bg-white/70 backdrop-blur-xl rounded-3xl';

export default function Messages() {
  const { user } = useAuth();
  const { chats, loading: chatsLoading } = useOwnerChats(user);
  const { items, loading: itemsLoading } = useOwnerItems(user);
  const loading = chatsLoading || itemsLoading;

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);

  function onOpenChat(chatId) {
    markChatRead(chatId, 'owner').catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">Conversations with people who found your items.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading conversations…</p>}

      {!loading && chats.length === 0 && (
        <Card className={glass}>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/5">
              <MessageSquare className="h-6 w-6 text-slate-500" />
            </span>
            <div>
              <p className="font-bold text-slate-800">No conversations yet.</p>
              <p className="mt-1 text-sm text-slate-500">
                When someone reports finding your item, the chat will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {chats.length > 0 && (
        <Card className={glass}>
          <CardContent className="divide-y divide-slate-200/70 p-0">
            {chats.map((chat) => {
              const item = itemsByTag[chat.tagId];
              const unread = Array.isArray(chat.unreadFor)
                ? chat.unreadFor.includes('owner')
                : chat.unreadFor === 'owner';
              const resolved = !!chat.resolved;
              return (
                <Link
                  key={chat.id}
                  to={`/chat/${chat.id}`}
                  onClick={() => onOpenChat(chat.id)}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-900/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900/5">
                      <MessageSquare className="h-4 w-4 text-slate-500" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {item?.itemName || 'Unknown item'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {chat.lastMessageText || 'No messages yet.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs text-slate-400">
                      {relativeTimeFromMs(toMillis(chat.lastMessageAt))}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {unread && <span className="h-2 w-2 rounded-full bg-purple-400" />}
                      <Badge variant={resolved ? 'secondary' : 'outline'}>
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
