import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerItems, useOwnerOpenReports, findChatIdForReport } from '../../lib/ownerItems';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

const glass = 'border-white/10 bg-white/5 backdrop-blur-xl';

// §4.5/§5.8: nudge the owner about items that have sat in Lost Mode a long
// time with nobody currently reporting them found.
const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'staleNudgeDismissed';

function daysSince(timestamp) {
  const ms = timestamp?.toMillis ? timestamp.toMillis() : null;
  if (!ms) return 0;
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
}

function relativeTime(timestamp) {
  const ms = timestamp?.toMillis ? timestamp.toMillis() : null;
  if (!ms) return 'just now';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function formatLocation(location) {
  if (!location) return null;
  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { items, loading: itemsLoading } = useOwnerItems(user);
  const tagIds = useMemo(() => items.map((i) => i.tagId), [items]);
  const { reports } = useOwnerOpenReports(tagIds);
  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);

  // "Active incident" = the most recent open report against an item that's
  // currently in lost mode (an open report on a recovered item is stale).
  const heroReport = useMemo(() => {
    const lost = reports.filter((r) => itemsByTag[r.tagId]?.isLostMode);
    return (
      lost.sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0))[0] || null
    );
  }, [reports, itemsByTag]);

  const [chatId, setChatId] = useState(null);
  useEffect(() => {
    let live = true;
    if (!heroReport) {
      setChatId(null);
      return;
    }
    findChatIdForReport(heroReport).then((id) => {
      if (live) setChatId(id);
    });
    return () => {
      live = false;
    };
  }, [heroReport]);

  const stats = [
    { label: 'Items tagged', value: items.length },
    { label: 'In lost mode', value: items.filter((i) => i.isLostMode).length, tone: 'text-red-400' },
    { label: 'Open reports', value: reports.length, tone: 'text-amber-300' },
  ];

  const heroItem = heroReport ? itemsByTag[heroReport.tagId] : null;

  // Items stuck in Lost Mode for a while with no one currently reporting them.
  const openReportTagIds = useMemo(() => new Set(reports.map((r) => r.tagId)), [reports]);
  const staleItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.isLostMode &&
          i.lostSince?.toMillis &&
          Date.now() - i.lostSince.toMillis() > STALE_MS &&
          !openReportTagIds.has(i.tagId)
      ),
    [items, openReportTagIds]
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismissKey = (item) => `${item.tagId}:${item.lostSince?.toMillis?.() ?? ''}`;
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
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className={`${glass} p-4 text-center`}>
            <CardContent className="p-0">
              <div className={`text-3xl font-extrabold ${s.tone || ''}`}>
                {itemsLoading ? '–' : s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {heroReport ? (
        <Card className="rounded-2xl border-red-500/40 bg-red-950/20 p-6 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
          <CardContent className="space-y-4 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-red-200">
                  Active found-item report
                </span>
              </div>
              <span className="text-xs text-slate-400">{relativeTime(heroReport.timestamp)}</span>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-red-300/80">Lost item</p>
              <h2 className="mt-0.5 text-xl font-extrabold text-white">
                {heroItem?.itemName || 'Unknown item'}
              </h2>
            </div>

            {heroReport.initialMessage && (
              <blockquote className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm italic text-slate-200">
                "{heroReport.initialMessage}"
              </blockquote>
            )}

            {formatLocation(heroReport.location) && (
              <p className="text-xs text-slate-400">
                Reported near: <span className="text-slate-200">{formatLocation(heroReport.location)}</span>
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <Badge variant="outline" className="border-white/20 text-slate-300">
                Report open
              </Badge>
              {chatId ? (
                <Button asChild variant="destructive">
                  <Link to={`/chat/${chatId}`}>Open chat →</Link>
                </Button>
              ) : (
                <span className="text-xs text-slate-500">Locating chat…</span>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className={glass}>
          <CardContent className="p-0">
            <h2 className="mb-1 text-lg font-bold">No active incidents</h2>
            <p className="text-sm text-slate-400">
              {items.length === 0
                ? 'Claim a tag to start protecting your belongings.'
                : "You're all clear — no open found-item reports right now."}
            </p>
            {items.length === 0 && (
              <Button asChild className="mt-3" variant="secondary">
                <Link to="/dashboard/items/claim">Claim your first tag</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {visibleStale.map((item) => (
        <Card key={item.tagId} className="rounded-2xl border-amber-500/30 bg-amber-950/10 p-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                <Clock className="h-4 w-4 text-amber-300" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  Still missing — "{item.itemName}"
                </p>
                <p className="text-xs text-slate-400">
                  Lost {daysSince(item.lostSince)} days ago. Update your listing or add a reward?
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
                className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card className={glass}>
        <CardContent className="space-y-2 p-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
            How your privacy is protected
          </h2>
          <p className="text-xs leading-relaxed text-slate-400">
            Your item listings are public-safe only — a finder ever sees the item name, lost
            status, and reward, never your name, email, phone, or address. That's enforced at the
            document level: the public <code className="text-slate-300">items</code> record and
            the private owner link live in separate Firestore collections, and Firestore security
            rules (not app code) are what block anyone else from reading or writing your data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
