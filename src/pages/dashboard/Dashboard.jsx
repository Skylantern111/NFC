import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, MessageSquareWarning, Package, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerItems, useOwnerTagIds, useOwnerOpenReports, useOwnerChats } from '../../lib/ownerItems';
import { daysSinceMs, relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

// §4.5/§5.8: nudge the owner about items that have sat in Lost Mode a long
// time with nobody currently reporting them found.
//
// Known limitations (IMPROVEMENT_PLAN.md §3): dismissal is localStorage-only
// so it doesn't sync across an owner's devices, and once an incident is
// marked recovered (see public/Chat.jsx#confirmRecovered) there's no history
// view — it simply disappears. Both would need a persisted field on the
// item/chat doc plus a new list view to fix properly; out of scope here.
const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'staleNudgeDismissed';

function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const { items, loading: itemsLoading } = useOwnerItems(user);
  const { tagIds } = useOwnerTagIds(user);
  const { reports, loading: reportsLoading } = useOwnerOpenReports(tagIds);
  const { chats } = useOwnerChats(user);
  const loading = itemsLoading || reportsLoading;

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);
  const chatByTag = useMemo(() => Object.fromEntries(chats.map((c) => [c.tagId, c])), [chats]);

  // "Active incident" = an item with an open found-report against it. No
  // items.status field in real Firestore (see firestore.rules) — this is
  // derived from the reports collection instead. Every open report gets its
  // own card below (not just the first) — an owner can have more than one
  // item reported found at once.
  const incidents = useMemo(
    () =>
      reports
        .map((report) => ({
          report,
          item: itemsByTag[report.tagId] || null,
          chat: chatByTag[report.tagId] || null,
        }))
        .filter((i) => i.item),
    [reports, itemsByTag, chatByTag]
  );

  const stats = [
    { label: 'Items tagged', value: items.length, icon: Package, tint: 'bg-purple-100 text-purple-600' },
    {
      label: 'In lost mode',
      value: items.filter((i) => i.isLostMode).length,
      icon: AlertTriangle,
      tint: 'bg-red-100 text-red-600',
    },
    {
      label: 'Open reports',
      value: reports.length,
      icon: MessageSquareWarning,
      tint: 'bg-amber-100 text-amber-600',
    },
  ];

  // Items stuck in Lost Mode for a while with no one currently reporting them.
  const openTagSet = useMemo(() => new Set(reports.map((r) => r.tagId)), [reports]);
  const staleItems = useMemo(
    () =>
      items.filter((i) => {
        const lostMs = toMillis(i.lostSince);
        return i.isLostMode && lostMs && Date.now() - lostMs > STALE_MS && !openTagSet.has(i.tagId);
      }),
    [items, openTagSet]
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismissKey = (item) => `${item.tagId}:${toMillis(item.lostSince) || ''}`;
  function dismissNudge(item) {
    setDismissed((prev) => {
      const next = [...prev, dismissKey(item)];
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
      } catch {
        // Storage blocked (private mode) — dismissal just won't persist across reload.
      }
      return next;
    });
  }
  const visibleStale = staleItems.filter((i) => !dismissed.includes(dismissKey(i)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-2xl bg-white/70 backdrop-blur-xl p-5 shadow-lg">
            <CardContent className="space-y-3 p-0">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.tint}`}>
                <s.icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <div className="text-2xl font-extrabold text-slate-800">{loading ? '–' : s.value}</div>
                <div className="mt-0.5 text-xs text-slate-500">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {incidents.length > 0 ? (
        <div className="space-y-3">
          {incidents.length > 1 && (
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Active incidents ({incidents.length})
            </h2>
          )}
          {incidents.map(({ report, item, chat }) => (
            <Card
              key={report.id}
              className="rounded-3xl border border-red-200 bg-red-50/60 p-6 shadow-lg"
            >
              <CardContent className="space-y-4 p-0 text-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Badge variant="outline" className="border-red-400 text-red-600 uppercase tracking-wide">
                    Report open
                  </Badge>
                  <Badge className="border-transparent bg-red-100 text-red-600 uppercase tracking-wide">
                    Active found-item report
                  </Badge>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lost item</p>
                  <h2 className="mt-1 text-xl font-extrabold text-slate-800">{item.itemName}</h2>
                </div>

                {chat?.lastMessageText && (
                  <blockquote className="mx-auto max-w-md text-sm italic text-slate-500">
                    "{chat.lastMessageText}"
                  </blockquote>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <Badge variant="outline" className="text-slate-600 uppercase tracking-wide">
                    Lost status
                  </Badge>
                  {chat && (
                    <span className="text-xs text-slate-400">
                      {relativeTimeFromMs(toMillis(chat.lastMessageAt))}
                    </span>
                  )}
                </div>

                {chat ? (
                  <Link
                    to={`/chat/${chat.id}`}
                    className="inline-block text-sm font-semibold text-purple-600 hover:text-purple-700"
                  >
                    Open chat →
                  </Link>
                ) : (
                  <p className="text-xs text-slate-400">No chat linked yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-3xl bg-white/70 backdrop-blur-xl p-6 shadow-lg">
          <CardContent className="flex flex-col items-center gap-3 p-0 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-800">No active incidents</h2>
              <p className="text-sm text-slate-500">
                {items.length === 0
                  ? 'Claim a tag to start protecting your belongings.'
                  : "You're all clear — no open found-item reports right now."}
              </p>
            </div>
            {items.length === 0 && (
              <Button asChild variant="secondary">
                <Link to="/dashboard/items/claim">Claim your first tag</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {visibleStale.map((item) => (
        <Card key={item.tagId} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-lg">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">Still missing — "{item.itemName}"</p>
                <p className="text-xs text-slate-500">
                  Lost {daysSinceMs(toMillis(item.lostSince))} days ago. Update your listing or add a reward?
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link to="/dashboard/items">Update listing</Link>
              </Button>
              <button
                type="button"
                onClick={() => dismissNudge(item)}
                aria-label="Dismiss"
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-700 active:bg-slate-900/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card className="rounded-3xl bg-white/70 backdrop-blur-xl p-6 shadow-lg">
        <CardContent className="space-y-2 p-0">
          <h2 className="text-sm font-bold text-slate-800">How your privacy is protected</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Your item listings are public-safe only — a finder ever sees the item name, lost
            status, and reward, never your name, email, phone, or address. Identity stays
            separated from item data at the database level, not just hidden in the UI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
