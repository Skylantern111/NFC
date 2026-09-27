import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, firebaseReady } from '../../firebase/config';
import { relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const CARD = 'rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg';

// Crashes reported from users' browsers (lib/errorLog.js →
// clientErrors). SYSTEM_AUDIT_ROUND4.md E1. Latest 100, grouped by message.
export default function Errors() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [open, setOpen] = useState(null); // message whose details are shown

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
      toast.error('Could not load errors: ' + err.message);
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
      toast.success('Error log cleared.');
    } catch (err) {
      toast.error('Could not clear: ' + err.message);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Errors</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Crashes reported from people&apos;s browsers (latest 100). Each browser reports at most 5 per page load.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {rows.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-rose-600" onClick={onClearAll} disabled={clearing}>
              {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Clear all
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : groups.length === 0 ? (
        <Card className={CARD}>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No errors reported.
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.message} className={CARD}>
            <CardContent className="space-y-2 p-4">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                onClick={() => setOpen(open === g.message ? null : g.message)}
              >
                <span className="font-mono text-sm text-slate-800 dark:text-slate-100 break-all">{g.message}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{g.count}×</Badge>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {relativeTimeFromMs(toMillis(g.latest.at))}
                  </span>
                </span>
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pages: {[...g.pages].join(', ')}</p>
              {open === g.message && (
                <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>Browser: {g.latest.userAgent || '—'}</p>
                  <p>Signed-in user: {g.latest.uid || 'none'}</p>
                  {g.latest.stack && (
                    <pre className="max-h-64 overflow-auto rounded-xl bg-base p-3 text-[11px] shadow-neu-pressed-sm whitespace-pre-wrap">
                      {g.latest.stack}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
