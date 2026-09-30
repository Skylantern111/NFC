import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Bug, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, firebaseReady } from '../../firebase/config';
import { friendlyFirestoreError, relativeTimeFromMs, toMillis } from '../../lib/utils';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { EmptyState, SkeletonList } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const CARD = 'rounded-3xl bg-white/80 dark:bg-white/5 shadow-card';

// Crashes reported from users' browsers (lib/errorLog.js →
// clientErrors). SYSTEM_AUDIT_ROUND4.md E1. Latest 100, grouped by message.
export default function Errors() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [open, setOpen] = useState(null); // message whose details are shown
  // UI_UX_IMPROVEMENT_PLAN.md ADM2: clearing the log asks first.
  const [confirmClear, setConfirmClear] = useState(false);

  async function load() {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'clientErrors'), orderBy('at', 'desc'), limit(100)));
      setRows(snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })));
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not load the error log. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const byMessage = new Map();
    for (const r of rows) {
      const g = byMessage.get(r.message) || { message: r.message, count: 0, latest: r, pages: new Set() };
      g.count += 1;
      g.pages.add(r.url);
      byMessage.set(r.message, g);
    }
    return [...byMessage.values()];
  }, [rows]);

  async function onClearAll() {
    setClearing(true);
    try {
      await Promise.all(rows.map((r) => deleteDoc(r.ref)));
      setRows([]);
      setConfirmClear(false);
      toast.success('Error log cleared.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not clear the log. Try again.'));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Error log"
        tourId="errors-header"
        backTo="/admin/settings"
        backLabel="Settings"
        description="Crashes reported from people's browsers (latest 100). Each browser reports at most 5 per page load."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load} loading={loading}>
              {!loading && <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </Button>
            {rows.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-red-700 dark:text-red-300" onClick={() => setConfirmClear(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Clear all
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <SkeletonList count={3} className="h-20" />
      ) : groups.length === 0 ? (
        <EmptyState icon={Bug} title="No errors reported" description="Nothing has crashed in anyone's browser recently." />
      ) : (
        groups.map((g) => (
          <Card key={g.message} className={CARD}>
            <CardContent className="space-y-2 p-4">
              <button
                type="button"
                className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 text-left"
                aria-expanded={open === g.message}
                onClick={() => setOpen(open === g.message ? null : g.message)}
              >
                <span className="font-mono text-sm text-slate-800 dark:text-slate-100 break-all">{g.message}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{g.count}×</Badge>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {relativeTimeFromMs(toMillis(g.latest.at))}
                  </span>
                </span>
              </button>
              <p className="break-all text-xs text-slate-600 dark:text-slate-400">Pages: {[...g.pages].join(', ')}</p>
              {open === g.message && (
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <p>Browser: {g.latest.userAgent || '—'}</p>
                  <p>Signed-in user: {g.latest.uid || 'none'}</p>
                  {g.latest.stack && (
                    <pre className="max-h-64 overflow-auto rounded-xl bg-base p-3 text-xs shadow-neu-pressed-sm whitespace-pre-wrap">
                      {g.latest.stack}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the whole error log?"
        description={`Deletes all ${rows.length} reported error${rows.length === 1 ? '' : 's'}.`}
        irreversible
        confirmLabel="Clear all"
        busyLabel="Clearing…"
        busy={clearing}
        onConfirm={onClearAll}
      />
    </div>
  );
}
