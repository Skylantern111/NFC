import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, ChevronRight, Clock, MailCheck, MessageSquare, MessageSquareWarning, Nfc, Package, PackageSearch, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useOwnerNotificationsContext } from '../../context/OwnerNotificationsContext';
import {
  useOwnerItems,
  useOwnerTagIds,
  useOwnerOpenReports,
  useStaleNudgeDismissals,
  dismissStaleNudge,
} from '../../lib/ownerItems';
import { firebaseReady } from '../../firebase/config';
import { daysSinceMs, friendlyFirestoreError, relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import GlassCard from '../../components/GlassCard';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import StatusStepper, { recoveryStep } from '../../components/StatusStepper';
import ReportLocationMap from '../../components/ReportLocationMap';

// §4.5/§5.8: nudge the owner about items that have sat in Lost Mode a long
// time with nobody currently reporting them found. Dismissal syncs across
// an owner's devices via `useStaleNudgeDismissals` (IMPROVEMENT_PLAN.md
// Round 2 #1).
//
// Known limitation (IMPROVEMENT_PLAN.md §3, UI_UX_IMPROVEMENT_PLAN.md REC4):
// once an incident is marked recovered there's no history view — it simply
// disappears from here.
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

const NOTIFICATION_LABEL = {
  report: 'Someone found your item',
  message: 'New message',
  moderation_resolved: 'Your report was reviewed',
};

// First-run guide (UI_UX_IMPROVEMENT_PLAN.md AUTH7), shown until the owner
// has claimed a tag.
const FIRST_STEPS = [
  { icon: Nfc, title: 'Claim a tag', detail: 'Tap your TagBack sticker or type the ID printed on it.' },
  { icon: Package, title: 'Name the item', detail: 'So finders know what they found.' },
  { icon: ShieldCheck, title: "You're protected", detail: 'If it goes missing, turn on Lost Mode in one tap.' },
];

const VERIFY_STEP = { icon: MailCheck, title: 'Verify your email', detail: 'Tap the link we emailed you when you signed up.' };

export default function Dashboard() {
  const { user } = useAuth();
  const { items, loading: itemsLoading } = useOwnerItems(user);
  const { tagIds } = useOwnerTagIds(user);
  const { reports, loading: reportsLoading } = useOwnerOpenReports(tagIds);
  const { chats, notifications } = useOwnerNotificationsContext();
  const loading = itemsLoading || reportsLoading;

  const itemsByTag = useMemo(() => Object.fromEntries(items.map((i) => [i.tagId, i])), [items]);
  // SYSTEM_AUDIT_ROUND2.md B2: each report has its own chat (chat.reportId).
  const chatByReport = useMemo(
    () => Object.fromEntries(chats.filter((c) => c.reportId).map((c) => [c.reportId, c])),
    [chats]
  );

  // "Active incident" = an item with an open found-report against it
  // (derived from `reports`; items has no status field). One card each.
  const incidents = useMemo(
    () =>
      reports
        .map((report) => ({
          report,
          item: itemsByTag[report.tagId] || null,
          chat: chatByReport[report.id] || null,
        }))
        .filter((i) => i.item),
    [reports, itemsByTag, chatByReport]
  );

  const lostCount = items.filter((i) => i.isLostMode).length;
  // Each tile opens the list it counts (UI_UX_IMPROVEMENT_PLAN.md DB2).
  const stats = [
    { label: 'Items tagged', value: items.length, icon: Package, to: '/dashboard/items', tint: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300' },
    { label: 'In Lost Mode', value: lostCount, icon: AlertTriangle, to: '/dashboard/items?filter=lost', tint: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300' },
    { label: 'Open reports', value: reports.length, icon: MessageSquareWarning, to: '/dashboard/messages?filter=open', tint: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  ];

  const openTagSet = useMemo(() => new Set(reports.map((r) => r.tagId)), [reports]);
  const staleItems = useMemo(
    () =>
      items.filter((i) => {
        const lostMs = toMillis(i.lostSince);
        return i.isLostMode && lostMs && Date.now() - lostMs > STALE_MS && !openTagSet.has(i.tagId);
      }),
    [items, openTagSet]
  );
  const { dismissed, dismissMock } = useStaleNudgeDismissals(user);
  async function dismissNudge(item) {
    const lostSinceMillis = toMillis(item.lostSince);
    if (!firebaseReady) {
      dismissMock(item.tagId, lostSinceMillis);
      return;
    }
    try {
      await dismissStaleNudge(user, item.tagId, lostSinceMillis);
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not dismiss this reminder.'));
    }
  }
  const visibleStale = staleItems.filter((i) => dismissed[i.tagId] !== toMillis(i.lostSince));
  const recent = notifications.slice(0, 3);

  const firstName = (user?.displayName || '').trim().split(/\s+/)[0];
  const firstRun = !loading && items.length === 0;
  // Unverified owners can't claim yet (firestore.rules), so verifying is
  // step one for them.
  const needsVerify = firebaseReady && !!user && !user.emailVerified;
  const steps = needsVerify ? [VERIFY_STEP, ...FIRST_STEPS] : FIRST_STEPS;

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Hi, ${firstName}` : 'Home'}
        documentTitle="Home"
        description={
          incidents.length > 0
            ? `${incidents.length === 1 ? 'Someone found one of your items' : `${incidents.length} of your items were found`}. Reply below.`
            : 'Your items and anything that needs you.'
        }
        actions={
          <Button asChild variant={incidents.length > 0 ? 'secondary' : 'primary'}>
            <Link to="/dashboard/items/claim">
              <Nfc className="h-4 w-4" /> Claim a tag
            </Link>
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-40 rounded-3xl" />
      ) : firstRun ? (
        <GlassCard>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Get started in {steps.length === 4 ? 'four' : 'three'} steps
          </h2>
          <ol className="mt-4 space-y-3">
            {steps.map(({ icon: Icon, title, detail }, i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base text-sm font-bold text-purple-700 dark:text-purple-300 shadow-neu-flat-sm">
                  {i + 1}
                </span>
                <div>
                  <p className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                    <Icon className="h-4 w-4 text-purple-700 dark:text-purple-300" aria-hidden="true" /> {title}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <Button asChild variant="primary" className="mt-5 w-full sm:w-auto">
            {needsVerify ? (
              <Link to="/dashboard/verify-email">Verify my email</Link>
            ) : (
              <Link to="/dashboard/items/claim">Claim your first tag</Link>
            )}
          </Button>
          {/* Privacy explainer only on first run (DB5) — not on every visit. */}
          <p className="mt-5 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            Finders see only your tap page: the item name, its lost status, your message and reward, and any links
            you add. Your account email is never shown.
          </p>
        </GlassCard>
      ) : incidents.length > 0 ? (
        <section className="space-y-3" aria-labelledby="incidents-heading">
          <h2 id="incidents-heading" className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Action needed
          </h2>
          {incidents.map(({ report, item, chat }) => (
            <GlassCard key={report.id} className="space-y-4 border-sky-200 dark:border-sky-500/30">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">Someone found your item</p>
                  <h3 className="truncate text-xl font-extrabold text-slate-800 dark:text-slate-100">{item.itemName}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Reported {relativeTimeFromMs(toMillis(report.timestamp)) || 'just now'}
                  </p>
                </div>
                <StatusBadge state="found" />
              </div>
              <StatusStepper step={recoveryStep({ chat, hasReport: true })} />
              <ReportLocationMap location={report.location} />
              {chat?.lastMessageText && (
                <blockquote className="rounded-2xl bg-base px-4 py-3 text-sm text-slate-700 dark:text-slate-200 shadow-neu-pressed-sm">
                  “{chat.lastMessageText}”
                </blockquote>
              )}
              {chat ? (
                <Button asChild variant="primary" className="w-full">
                  <Link to={`/chat/${chat.id}`}>
                    <MessageSquare className="h-4 w-4" /> Reply to finder
                  </Link>
                </Button>
              ) : (
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/dashboard/messages">Open Messages</Link>
                </Button>
              )}
            </GlassCard>
          ))}
        </section>
      ) : (
        <GlassCard className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-800 dark:text-slate-100">All clear</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No one has reported finding your items. If something goes missing, turn on Lost Mode.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link to="/dashboard/items">
              <PackageSearch className="h-4 w-4" /> Go to My Items
            </Link>
          </Button>
        </GlassCard>
      )}

      {visibleStale.map((item) => (
        <div
          key={item.tagId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/20 bg-warning-soft p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">Still missing: {item.itemName}</p>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Lost {daysSinceMs(toMillis(item.lostSince))} days ago. Update the message or add a reward?
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild size="sm" variant="secondary">
              <Link to="/dashboard/items">Update</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => dismissNudge(item)}
              aria-label={`Dismiss reminder for ${item.itemName}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {/* Your items — counts, each opening the list it counts (DB2). Below
          anything that needs action, so numbers never outrank a finder. */}
      {!firstRun && (
        <section aria-labelledby="items-heading" className="space-y-2">
          <h2 id="items-heading" className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Your items
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {stats.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                className="glass flex flex-col gap-2 p-3 transition-shadow hover:shadow-lg sm:p-5"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.tint}`}>
                  <s.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {loading ? (
                  <Skeleton className="h-8 w-10" />
                ) : (
                  <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{s.value}</span>
                )}
                <span className="text-xs text-slate-600 dark:text-slate-400">{s.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity (DB6) — reuses the shared notifications listener. */}
      {!firstRun && recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="recent-heading" className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Recent activity
            </h2>
            <Link to="/dashboard/notifications" className="text-sm font-semibold text-purple-700 dark:text-purple-300 hover:underline">
              See all
            </Link>
          </div>
          <ul className="glass divide-y divide-slate-200/70 dark:divide-white/10 overflow-hidden p-0">
            {recent.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.chatId ? `/chat/${n.chatId}` : '/dashboard/notifications'}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-slate-900/5 dark:hover:bg-white/5"
                >
                  <Bell className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${n.read ? 'text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-800 dark:text-slate-100'}`}>
                      {NOTIFICATION_LABEL[n.type] || 'Update'}
                    </span>
                    <span className="block truncate text-xs text-slate-600 dark:text-slate-400">
                      {itemsByTag[n.tagId]?.itemName || 'One of your items'} · {relativeTimeFromMs(toMillis(n.createdAt))}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
