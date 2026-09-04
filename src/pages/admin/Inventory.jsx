import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { generateBatch, batchToCsv, tagUrl } from '../../lib/tags';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const BATCH_SIZES = [50, 100, 250, 500];
const CHIP_TYPES = [
  { value: 'NTAG213', label: 'NTAG213', detail: '144 user bytes' },
  { value: 'NTAG215', label: 'NTAG215', detail: '504 user bytes' },
  { value: 'NTAG216', label: 'NTAG216', detail: '888 user bytes' },
];

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'unclaimed', label: 'Unclaimed' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'blacklisted', label: 'Blacklisted' },
];

const STATUS_BADGE = {
  unclaimed: 'border-slate-200 bg-slate-100 text-slate-600',
  claimed: 'border-emerald-200 bg-emerald-50/80 text-emerald-600',
  blacklisted: 'border-rose-200 bg-rose-50/80 text-rose-600',
};

const ROW_LIMIT = 100;

function relativeTime(date) {
  if (!date) return '—';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function toDate(createdAt) {
  // Firestore Timestamp has toDate(); tolerate a raw number too (shouldn't
  // occur for freshly-provisioned tags, but old/manually-seeded docs might).
  if (!createdAt) return null;
  if (typeof createdAt.toDate === 'function') return createdAt.toDate();
  if (typeof createdAt === 'number') return new Date(createdAt);
  return null;
}

// Batch provisioning + live lifecycle table for the tags inventory.
// Batches are persisted for real via a Firestore batched write (admin-only
// per firestore.rules); the lifecycle table reads live from `tags`.
export default function Inventory() {
  const [batchSize, setBatchSize] = useState('50');
  const [chipType, setChipType] = useState('NTAG215');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [lastBatch, setLastBatch] = useState([]);

  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState('');

  const [counts, setCounts] = useState({ all: null, unclaimed: null, claimed: null, blacklisted: null });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [blacklistTarget, setBlacklistTarget] = useState(null); // tagId or null
  const [flagReason, setFlagReason] = useState('');
  const [blacklistBusy, setBlacklistBusy] = useState(false);
  const [copiedTagId, setCopiedTagId] = useState('');

  const loadRows = useCallback(async () => {
    setRowsLoading(true);
    setRowsError('');
    try {
      const q = query(collection(db, 'tags'), orderBy('createdAt', 'desc'), limit(ROW_LIMIT));
      const snap = await getDocs(q);
      setRows(snap.docs.map((d) => d.data()));
    } catch (err) {
      setRowsError(err.message || 'Failed to load tags.');
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const tagsRef = collection(db, 'tags');
      const [all, unclaimed, claimed, blacklisted] = await Promise.all([
        getCountFromServer(tagsRef),
        getCountFromServer(query(tagsRef, where('status', '==', 'unclaimed'))),
        getCountFromServer(query(tagsRef, where('status', '==', 'claimed'))),
        getCountFromServer(query(tagsRef, where('status', '==', 'blacklisted'))),
      ]);
      setCounts({
        all: all.data().count,
        unclaimed: unclaimed.data().count,
        claimed: claimed.data().count,
        blacklisted: blacklisted.data().count,
      });
    } catch {
      // Counts are a nice-to-have; leave them null (rendered as "—") if the
      // aggregation queries fail (e.g. rules not yet deployed).
    }
  }, []);

  useEffect(() => {
    loadRows();
    loadCounts();
  }, [loadRows, loadCounts]);

  async function nextBatchNumber() {
    const q = query(collection(db, 'tags'), orderBy('batchNumber', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return 1;
    return (snap.docs[0].data().batchNumber || 0) + 1;
  }

  async function onGenerate() {
    setGenerating(true);
    setGenerateError('');
    try {
      const clamped = Math.max(50, Math.min(500, Number(batchSize) || 50));
      const batchNumber = await nextBatchNumber();
      const tags = generateBatch(clamped, batchNumber).map((t) => ({ ...t, chipType }));

      const wb = writeBatch(db);
      for (const t of tags) {
        wb.set(doc(db, 'tags', t.tagId), {
          tagId: t.tagId,
          batchNumber: t.batchNumber,
          status: 'unclaimed',
          chipType,
          createdAt: serverTimestamp(),
        });
      }
      await wb.commit();

      setLastBatch(tags);
      await Promise.all([loadRows(), loadCounts()]);
    } catch (err) {
      setGenerateError(err.message || 'Failed to generate batch.');
    } finally {
      setGenerating(false);
    }
  }

  function onExport() {
    if (!lastBatch.length) return;
    const blob = new Blob([batchToCsv(lastBatch)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfc-batch-${lastBatch[0].batchNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onCopyUrl(tagId) {
    try {
      await navigator.clipboard.writeText(tagUrl(tagId));
      setCopiedTagId(tagId);
      setTimeout(() => setCopiedTagId((cur) => (cur === tagId ? '' : cur)), 1500);
    } catch {
      // Clipboard API can fail (permissions/insecure context) — ignore silently.
    }
  }

  async function onConfirmBlacklist() {
    if (!blacklistTarget) return;
    setBlacklistBusy(true);
    try {
      await updateDoc(doc(db, 'tags', blacklistTarget), {
        status: 'blacklisted',
        flagReason: flagReason.trim() || 'No reason given',
      });
      setBlacklistTarget(null);
      setFlagReason('');
      await Promise.all([loadRows(), loadCounts()]);
    } catch (err) {
      setRowsError(err.message || 'Failed to blacklist tag.');
    } finally {
      setBlacklistBusy(false);
    }
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!term) return true;
      return (
        t.tagId?.toLowerCase().includes(term) || String(t.batchNumber ?? '').includes(term)
      );
    });
  }, [rows, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">NFC inventory</h1>
        <p className="mt-1 text-sm text-slate-500">
          Provision NFC tag batches and manage their claim lifecycle.
        </p>
      </div>

      {/* KPI strip — real counts from the tags collection */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_TABS.map((s) => (
          <div key={s.value} className="rounded-2xl bg-white/80 p-4 shadow-lg">
            <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">
              {counts[s.value] === null ? '—' : counts[s.value].toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* LEFT: batch provisioning form */}
        <Card className="rounded-3xl bg-white/80 text-slate-800 shadow-lg xl:col-span-5">
          <CardHeader>
            <CardTitle>Provision a new batch</CardTitle>
            <CardDescription className="text-slate-500">
              Generates unique tag IDs and writes them to the inventory as{' '}
              <span className="font-mono text-slate-600">unclaimed</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-600">Batch size</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={batchSize}
                onValueChange={(v) => v && setBatchSize(v)}
                className="w-full"
              >
                {BATCH_SIZES.map((n) => (
                  <ToggleGroupItem
                    key={n}
                    value={String(n)}
                    className="data-[state=on]:bg-gradient-to-r data-[state=on]:from-purple-600 data-[state=on]:to-pink-600 data-[state=on]:text-white"
                  >
                    {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-600">Chip type</Label>
              <RadioGroup value={chipType} onValueChange={setChipType} className="gap-2">
                {CHIP_TYPES.map((c) => (
                  <label
                    key={c.value}
                    htmlFor={`chip-${c.value}`}
                    className={`flex cursor-pointer items-center justify-between rounded-xl p-3 transition-shadow ${
                      chipType === c.value
                        ? 'bg-purple-50 shadow-neu-pressed-sm'
                        : 'bg-base shadow-neu-flat-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value={c.value} id={`chip-${c.value}`} />
                      <span className="text-sm font-medium text-slate-800">{c.label}</span>
                    </div>
                    <span className="font-mono text-xs text-slate-500">{c.detail}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {generateError && (
              <p className="text-sm text-rose-600">{generateError}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={onGenerate} disabled={generating}>
                {generating ? 'Generating…' : 'Generate batch'}
              </Button>
              <Button variant="outline" onClick={onExport} disabled={!lastBatch.length}>
                Export CSV
              </Button>
              {lastBatch.length > 0 && (
                <span className="text-sm text-slate-500">
                  Last batch: {lastBatch.length} tags (#{lastBatch[0].batchNumber})
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: lifecycle table */}
        <Card className="rounded-3xl bg-white/80 text-slate-800 shadow-lg xl:col-span-7">
          <CardHeader>
            <CardTitle>Tag lifecycle</CardTitle>
            <CardDescription className="text-slate-500">
              Most recent {ROW_LIMIT} tags, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search tag ID or batch number…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-1.5">
                {STATUS_TABS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatusFilter(s.value)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-shadow ${
                      statusFilter === s.value
                        ? 'bg-purple-100 text-purple-700 shadow-neu-pressed-sm'
                        : 'bg-base text-slate-500 shadow-neu-flat-sm hover:text-slate-800'
                    }`}
                  >
                    {s.label}
                    {counts[s.value] !== null && <span className="ml-1 text-slate-400">({counts[s.value]})</span>}
                  </button>
                ))}
              </div>
            </div>

            {rowsError && <p className="text-sm text-rose-600">{rowsError}</p>}

            <div className="overflow-x-auto rounded-xl bg-base shadow-neu-pressed-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-slate-500">Tag ID</TableHead>
                    <TableHead className="text-slate-500">Batch</TableHead>
                    <TableHead className="text-slate-500">Chip</TableHead>
                    <TableHead className="text-slate-500">Status</TableHead>
                    <TableHead className="text-slate-500">Created</TableHead>
                    <TableHead className="text-right text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsLoading && (
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                        Loading tags…
                      </TableCell>
                    </TableRow>
                  )}
                  {!rowsLoading && filteredRows.length === 0 && (
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                        No tags match this view. Generate a batch to provision tags.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredRows.map((t) => {
                    const created = toDate(t.createdAt);
                    return (
                      <TableRow key={t.tagId} className="border-slate-200/60 hover:bg-slate-900/5">
                        <TableCell className="font-mono text-xs text-slate-700" title={t.tagId}>
                          {t.tagId.slice(0, 10)}…
                        </TableCell>
                        <TableCell className="text-slate-600">{t.batchNumber}</TableCell>
                        <TableCell className="text-slate-600">{t.chipType || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[t.status] || STATUS_BADGE.unclaimed}>
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500" title={created ? created.toLocaleString() : ''}>
                          {relativeTime(created)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => onCopyUrl(t.tagId)}>
                              {copiedTagId === t.tagId ? 'Copied' : 'Copy URL'}
                            </Button>
                            {t.status !== 'blacklisted' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-rose-600"
                                onClick={() => {
                                  setBlacklistTarget(t.tagId);
                                  setFlagReason('');
                                }}
                              >
                                Blacklist
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!blacklistTarget} onOpenChange={(open) => !open && setBlacklistTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blacklist tag</DialogTitle>
            <DialogDescription>
              This marks the tag as blacklisted so it can no longer be claimed or resolved.
              {blacklistTarget && (
                <span className="mt-1 block font-mono text-xs text-slate-500">{blacklistTarget}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-slate-600">Reason</Label>
            <Input
              autoFocus
              placeholder="e.g. reported tampered / lost stock"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlacklistTarget(null)} disabled={blacklistBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmBlacklist} disabled={blacklistBusy}>
              {blacklistBusy ? 'Blacklisting…' : 'Blacklist tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
