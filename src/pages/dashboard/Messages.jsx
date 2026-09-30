import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isChatUnreadForOwner, useOwnerNotificationsContext } from '../../context/OwnerNotificationsContext';
import { useOwnerItems, markChatRead } from '../../lib/ownerItems';
import { CATEGORY_ICON } from '../../lib/categories';
import { cn, relativeTimeFromMs, toMillis } from '../../lib/utils';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import { EmptyState, LoadErrorState, SkeletonList } from '../../components/States';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Recovered' },
];

// The owner's inbox (UI_UX_IMPROVEMENT_PLAN.md NAV3): one row per chat with
// a finder, unread rows in bold, status as a badge.
export default function Messages() {
  const { user } = useAuth();
  const { chats, chatsLoading, chatsError, retryChats, unreadChatCount } = useOwnerNotificationsContext();
  const { items, loading: itemsLoading } = useOwnerItems(user);
  const loading = chatsLoading || itemsLoading;
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some((f) => f.value === params.get('filter')) ? params.get('filter') : 'all';

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);
  const visibleChats = useMemo(() => {
    if (filter === 'all') return chats;
    return chats.filter((c) => (filter === 'resolved' ? c.resolved : !c.resolved));
  }, [chats, filter]);

  function onOpenChat(chatId) {
    markChatRead(chatId, 'owner').catch(() => {});
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        description={
          unreadChatCount > 0
            ? `${unreadChatCount} conversation${unreadChatCount === 1 ? '' : 's'} with new messages.`
            : 'Private chats with people who found your items.'
        }
        tourId="messages-header"
      />

      {loading && <SkeletonList count={3} className="h-16" />}

      {chatsError && <LoadErrorState what="your conversations" error={chatsError} onRetry={retryChats} />}

      {!loading && !chatsError && chats.length === 0 && (
        <EmptyState
          data-tour="messages-empty"
          icon={MessageSquare}
          title="No conversations yet"
          description="You don't have any conversations yet. When someone finds your item and messages you, the chat shows up here."
        />
      )}

      {!loading && chats.length > 0 && (
        <div role="group" aria-label="Filter conversations" className="flex flex-wrap gap-2" data-tour="messages-filters">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setParams(f.value === 'all' ? {} : { filter: f.value })}
              className={cn(
                'min-h-11 rounded-md border-2 border-foreground px-3.5 text-sm font-bold transition-all',
                filter === f.value
                  ? 'bg-primary text-primary-foreground shadow-brut-sm'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {!loading && chats.length > 0 && visibleChats.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title={filter === 'open' ? 'No open conversations' : 'No recovered items yet'}
        />
      )}

      {!loading && visibleChats.length > 0 && (
        <ul className="glass divide-y divide-foreground/15 overflow-hidden p-0" data-tour="messages-list">
          {visibleChats.map((chat) => {
            const item = itemsByTag[chat.tagId];
            const unread = isChatUnreadForOwner(chat);
            const Icon = CATEGORY_ICON[item?.category] || MessageSquare;
            return (
              <li key={chat.id}>
                <Link
                  to={`/chat/${chat.id}`}
                  onClick={() => onOpenChat(chat.id)}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'truncate text-sm text-foreground',
                          unread ? 'font-bold' : 'font-medium'
                        )}
                      >
                        {item?.itemName || 'Unknown item'}
                      </span>
                      {unread && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block truncate text-sm',
                        unread ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {chat.lastMessageText || 'No messages yet.'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {relativeTimeFromMs(toMillis(chat.lastMessageAt))}
                    </span>
                    {chat.blocked && !chat.resolved ? (
                      <StatusBadge state="review" />
                    ) : (
                      <StatusBadge state={chat.resolved ? 'recovered' : 'open'} />
                    )}
                  </span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
