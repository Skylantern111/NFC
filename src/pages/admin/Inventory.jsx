import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  startAfter,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { inventoryToCsv, normalizeTagbackId, tagUrl } from '../../lib/tags';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { FormError } from '@/components/FormField';
import { contentLabel } from '../../lib/tagContent';
import { findOwnerByTag } from '../../lib/adminOwners';
import { chunk, friendlyFirestoreError, relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Boxes,
  CircleDashed,
  CheckCircle2,
  ShieldAlert,
  Search,
  Undo2,
  Nfc,
  RefreshCw,
  PencilLine,
  MoreHorizontal,
  Copy,
  Ban,
} from 'lucide-react';

const STATUS_TABS = [
  { value: 'all', label: 'All', icon: Boxes, tint: 'bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300' },
  { value: 'registered', label: 'Registered', icon: CircleDashed, tint: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
  { value: 'claimed', label: 'Claimed', icon: CheckCircle2, tint: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  { value: 'blacklisted', label: 'Blacklisted', icon: ShieldAlert, tint: 'bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300' },
];

const WRITE_STATUS_LABEL = {
  not_written: 'Not written',
  writing: 'Writing…',
  written: 'Written',
  write_failed: 'Write failed',
};

const ROW_LIMIT = 100;



function toDate(createdAt) {
  // Firestore Timestamp has toDate(); tolerate a raw number too (shouldn't
  // occur for freshly-registered tags, but old/manually-seeded docs might).
  if (!createdAt) return null;
  if (typeof createdAt.toDate === 'function') return createdAt.toDate();
  if (typeof createdAt === 'number') return new Date(createdAt);
  return null;
}

// Live lifecycle table over the `tags` registry. Every row here originates
// from a real physical tap registered at /admin/nfc-register
// (NFC_REARCHITECTURE_PLAN.md §5) — this page no longer mints tag
// identities itself.
export default function Inventory() {
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsMoreLoading, setRowsMoreLoading] = useState(false);
  const [rowsError, setRowsError] = useState('');
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  // Freezes the live first-page listener below once "Load more" has paged
  // further, so an incoming write doesn't reorder/duplicate rows the admin
  // has already paginated past.
  const [paged, setPaged] = useState(false);

  const [counts, setCounts] = useState({ all: null, registered: null, claimed: null, blacklisted: null });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [blacklistTarget, setBlacklistTarget] = useState(null); // tagId, '__bulk__', or null
  const [flagReason, setFlagReason] = useState('');
  const [blacklistBusy, setBlacklistBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [ownerLookup, setOwnerLookup] = useState({}); // tagId -> { loading, owner }
  const [profiles, setProfiles] = useState({}); // tagId -> tagProfiles doc (only tags that have one)
  const navigate = useNavigate();

  // Table only shows ROW_LIMIT rows at a time (KPI counts above stay
  // accurate regardless) — "Load more" pages the rest in via a startAfter
  // cursor instead of silently truncating inventory past 100 tags.
  async function loadMoreRows() {
    if (!lastDoc) return;
    setPaged(true);
    setRowsMoreLoading(true);
    setRowsError('');
    try {
      const q = query(
        collection(db, 'tags'),
        orderBy('registeredAt', 'desc'),
        startAfter(lastDoc),
        limit(ROW_LIMIT)
      );
      const snap = await getDocs(q);
      setRows((prev) => [...prev, ...snap.docs.map((d) => d.data())]);
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      setHasMore(snap.docs.length === ROW_LIMIT);
    } catch (err) {
      setRowsError(friendlyFirestoreError(err, 'Could not load more tags. Try again.'));
    } finally {
      setRowsMoreLoading(false);
    }
  }

  const loadCounts = useCallback(async () => {
    try {
      const tagsRef = collection(db, 'tags');
      const [all, registered, claimed, blacklisted] = await Promise.all([
        getCountFromServer(tagsRef),
        getCountFromServer(query(tagsRef, where('status', '==', 'registered'))),
        getCountFromServer(query(tagsRef, where('status', '==', 'claimed'))),
        getCountFromServer(query(tagsRef, where('status', '==', 'blacklisted'))),
      ]);
      setCounts({
        all: all.data().count,
        registered: registered.data().count,
        claimed: claimed.data().count,
        blacklisted: blacklisted.data().count,
      });
    } catch {
      // Counts are a nice-to-have; leave them null (rendered as "—") if the
      // aggregation queries fail (e.g. rules not yet deployed).
    }
  }, []);

  // Live first page: an admin watching the tab sees a tag registered (or
  // blacklisted) elsewhere without navigating away and back. Pagination
  // stays a one-shot fetch (loadMoreRows) — see `paged` above.
  useEffect(() => {
    setRowsLoading(true);
    setRowsError('');
    const q = query(collection(db, 'tags'), orderBy('registeredAt', 'desc'), limit(ROW_LIMIT));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!paged) {
          setRows(snap.docs.map((d) => d.data()));
          setLastDoc(snap.docs[snap.docs.length - 1] || null);
          setHasMore(snap.docs.length === ROW_LIMIT);
        }
        setRowsLoading(false);
        loadCounts();
      },
      (err) => {
        setRowsError(friendlyFirestoreError(err, 'Could not load tags. Try again.'));
        setRowsLoading(false);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged]);

  async function onCopyUrl(tagId) {
    try {
      await navigator.clipboard.writeText(tagUrl(tagId));
      toast.success(`Copied the URL for ${tagId}.`);
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.');
    }
  }

  // On-demand admin-only owner reveal — resolved via the existing
  // itemOwners -> users join (lib/adminOwners.js#findOwnerByTag), never
  // denormalized onto the public tags doc (firestore.rules keeps tags
  // public-read; see NFC_REARCHITECTURE_PLAN.md §1.6/§7).
  async function onRevealOwner(tagId) {
    setOwnerLookup((prev) => ({ ...prev, [tagId]: { loading: true } }));
    try {
      const { owner } = await findOwnerByTag(tagId);
      setOwnerLookup((prev) => ({ ...prev, [tagId]: { loading: false, owner } }));
    } catch (err) {
      setOwnerLookup((prev) => ({ ...prev, [tagId]: { loading: false, error: friendlyFirestoreError(err, 'Lookup failed.') } }));
    }
  }

  // Admin-only details (reason, who, which status to restore) go to
  // tagAdmin/{tagId}, not the public tags doc (SYSTEM_AUDIT_PLAN.md A7).
  // The prior status comes from every row we know about — loaded pages AND
  // server-search matches — so a tag found by search isn't wrongly recorded
  // as 'registered' (B7), which would make a claimed tag look claimable
  // after un-blacklisting.
  function priorStatusOf(tagId) {
    return [...rows, ...serverMatches].find((r) => r.tagId === tagId)?.status || 'registered';
  }

  async function onConfirmBlacklist() {
    if (!blacklistTarget || !flagReason.trim()) return;
    setBlacklistBusy(true);
    try {
      const reason = flagReason.trim();
      const targets = blacklistTarget === '__bulk__' ? [...selectedIds] : [blacklistTarget];
      // 2 writes per tag, 200 tags per batch: under Firestore's 500-write cap.
      for (const group of chunk(targets, 200)) {
        const wb = writeBatch(db);
        for (const tagId of group) {
          wb.update(doc(db, 'tags', tagId), { status: 'blacklisted' });
          wb.set(
            doc(db, 'tagAdmin', tagId),
            {
              blacklistedFromStatus: priorStatusOf(tagId),
              flagReason: reason,
              blacklistedBy: auth.currentUser?.uid || null,
              blacklistedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
        await wb.commit();
      }
      if (blacklistTarget === '__bulk__') setSelectedIds(new Set());
      setBlacklistTarget(null);
      setFlagReason('');
      await loadCounts();
    } catch (err) {
      setRowsError(friendlyFirestoreError(err, 'Could not blacklist. Try again.'));
    } finally {
      setBlacklistBusy(false);
    }
  }

  // Reverses onConfirmBlacklist — a tag flagged by mistake (or one that
  // turns out fine) has a way back, mirroring Moderation's symmetric
  // Ban/Unban pattern instead of leaving blacklisting one-way. Restores
  // whichever status it was blacklisted from, not a hardcoded 'registered'.
  // Tags blacklisted before tagAdmin existed keep that info on the tag doc
  // itself; those legacy public fields are removed here.
  const [unblacklistBusy, setUnblacklistBusy] = useState('');
  async function onUnblacklist(tag) {
    setUnblacklistBusy(tag.tagId);
    try {
      const [adminSnap, ownerSnap] = await Promise.all([
        getDoc(doc(db, 'tagAdmin', tag.tagId)),
        getDoc(doc(db, 'itemOwners', tag.tagId)),
      ]);
      let fromStatus =
        (adminSnap.exists() && adminSnap.data().blacklistedFromStatus) || tag.blacklistedFromStatus || 'registered';
      // The owner may have deleted their account while it was blacklisted
      // (SYSTEM_AUDIT_ROUND4 C1): no owner left means back to stock, not an
      // ownerless 'claimed' tag.
      if (fromStatus === 'claimed' && !ownerSnap.exists()) fromStatus = 'registered';
      const wb = writeBatch(db);
      wb.update(doc(db, 'tags', tag.tagId), {
        status: fromStatus,
        blacklistedFromStatus: deleteField(),
        flagReason: deleteField(),
        blacklistedBy: deleteField(),
        blacklistedAt: deleteField(),
      });
      wb.set(
        doc(db, 'tagAdmin', tag.tagId),
        {
          blacklistedFromStatus: deleteField(),
          flagReason: deleteField(),
          blacklistedBy: deleteField(),
          blacklistedAt: deleteField(),
        },
        { merge: true }
      );
      await wb.commit();
      await loadCounts();
    } catch (err) {
      setRowsError(friendlyFirestoreError(err, 'Could not unblacklist. Try again.'));
    } finally {
      setUnblacklistBusy('');
    }
  }

  // The table only ever holds the loaded page(s) (ROW_LIMIT + whatever "Load
  // more" has paged in) — searching for a tag that hasn't been loaded yet
  // used to silently read as "doesn't exist." Once the loaded page has no
  // local match, fall back to a targeted server query (exact tag id or
  // physical UID) covering the whole inventory.
  const [serverMatches, setServerMatches] = useState([]);
  const [serverSearching, setServerSearching] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setServerMatches([]);
      return;
    }
    const lower = term.toLowerCase();
    const localHasMatch = rows.some(
      (t) => t.tagId?.toLowerCase().includes(lower) || t.physicalUid?.toLowerCase().includes(lower)
    );
    if (localHasMatch) {
      setServerMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setServerSearching(true);
      try {
        const tagsRef = collection(db, 'tags');
        const queries = [
          // normalizeTagbackId: 'tbabcd2345' or 'TB ABCD 2345' also finds
          // TB-ABCD-2345 (SYSTEM_AUDIT_ROUND4.md B2).
          getDocs(query(tagsRef, where('tagId', '==', normalizeTagbackId(term).toUpperCase()), limit(1))),
          getDocs(query(tagsRef, where('physicalUid', '==', term.toUpperCase().replace(/:/g, '')), limit(1))),
        ];
        const snaps = await Promise.all(queries);
        if (cancelled) return;
        const seen = new Set();
        const found = [];
        for (const snap of snaps) {
          for (const d of snap.docs) {
            if (!seen.has(d.id)) {
              seen.add(d.id);
              found.push(d.data());
            }
          }
        }
        setServerMatches(found);
      } catch {
        // Best-effort — the loaded-page search above still stands either way.
      } finally {
        if (!cancelled) setServerSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, rows]);

  // Content column: tagProfiles for the loaded rows, 30 ids per `in` query
  // (Firestore's limit) instead of one read per row. Keyed on the id list so
  // live row updates that don't add/remove tags don't refetch.
  const rowIdsKey = rows.map((t) => t.tagId).join(',');
  useEffect(() => {
    const ids = rowIdsKey ? rowIdsKey.split(',') : [];
    if (ids.length === 0) return;
    let live = true;
    (async () => {
      try {
        const snaps = await Promise.all(
          chunk(ids, 30).map((part) => getDocs(query(collection(db, 'tagProfiles'), where(documentId(), 'in', part))))
        );
        if (!live) return;
        const next = {};
        for (const snap of snaps) for (const d of snap.docs) next[d.id] = d.data();
        setProfiles(next);
      } catch {
        // Column falls back to "Lost & Found" — the default when no profile exists.
      }
    })();
    return () => {
      live = false;
    };
  }, [rowIdsKey]);

  // Bulk content only targets unclaimed tags — applying a template to a
  // claimed tag would overwrite the owner's own content.
  function onBulkContent() {
    const tagIds = filteredRows.filter((t) => selectedIds.has(t.tagId) && t.status === 'registered').map((t) => t.tagId);
    navigate('/admin/tags/bulk', { state: { tagIds, skipped: selectedIds.size - tagIds.length } });
  }

  // Selection is scoped to whatever's currently filtered/loaded — switching
  // filters or searching while rows are checked would otherwise leave stale
  // (now-hidden) tag IDs selected with no way to see or clear them.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, search]);

  function toggleSelected(tagId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const local = rows.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!term) return true;
      return t.tagId?.toLowerCase().includes(term) || t.physicalUid?.toLowerCase().includes(term);
    });
    if (local.length > 0 || !term) return local;
    return serverMatches.filter((t) => statusFilter === 'all' || t.status === statusFilter);
  }, [rows, statusFilter, search, serverMatches]);

  // Only non-blacklisted rows are selectable — blacklisting an already-
  // blacklisted tag is a no-op the bulk action shouldn't offer.
  const selectableRows = useMemo(() => filteredRows.filter((t) => t.status !== 'blacklisted'), [filteredRows]);
  const allSelectableChecked = selectableRows.length > 0 && selectableRows.every((t) => selectedIds.has(t.tagId));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allSelectableChecked) return new Set();
      return new Set(selectableRows.map((t) => t.tagId));
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description="Registered NFC stickers and where each one is in its life: registered, claimed or blacklisted."
        actions={
          <Button asChild variant="primary" className="gap-2">
            <Link to="/admin/nfc-register">
              <Nfc className="h-4 w-4" /> Register tags
            </Link>
          </Button>
        }
      />

      {/* KPI strip — real counts from the tags collection */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_TABS.map((s) => (
          <div key={s.value} className="rounded-2xl bg-white/80 dark:bg-white/5 p-4 shadow-card">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.tint}`}>
              <s.icon className="h-4.5 w-4.5" />
            </span>
            <div className="mt-3 text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">{s.label}</div>
            {counts[s.value] === null ? (
              <Skeleton className="mt-1 h-7 w-12" />
            ) : (
              <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
                {counts[s.value].toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      <Card className="rounded-3xl bg-white/80 dark:bg-white/5 text-slate-800 dark:text-slate-100 shadow-card">
        <CardHeader>
          <CardTitle>Tag lifecycle</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Most recent {ROW_LIMIT} tags, newest registration first. New rows only ever come from{' '}
            <Link to="/admin/nfc-register" className="font-semibold text-purple-600 hover:text-pink-600">
              registering a physical tap
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                type="search"
                aria-label="Search by TagBack ID or physical UID"
                placeholder="Search TagBack ID or physical UID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:max-w-xs"
              />
              {serverSearching && (
                <span className="flex items-center gap-1.5 rounded-full bg-base px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 shadow-neu-pressed-sm">
                  <Search className="h-3 w-3 animate-pulse" /> Searching full inventory…
                </span>
              )}
              {!serverSearching && serverMatches.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-base px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 shadow-neu-pressed-sm">
                  <Search className="h-3 w-3" /> Found beyond the loaded {ROW_LIMIT} — showing full-inventory match.
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!filteredRows.length) return;
                  const blob = new Blob([inventoryToCsv(filteredRows)], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `nfc-inventory-${statusFilter}-${Date.now()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={!filteredRows.length}
              >
                Export this view
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-rose-600"
                  onClick={() => {
                    setBlacklistTarget('__bulk__');
                    setFlagReason('');
                  }}
                >
                  Blacklist selected ({selectedIds.size})
                </Button>
              )}
              {selectedIds.size > 0 && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onBulkContent}>
                  <PencilLine className="h-3.5 w-3.5" /> Set content ({selectedIds.size})
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_TABS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusFilter(s.value)}
                  aria-pressed={statusFilter === s.value}
                  className={`min-h-9 rounded-lg px-2.5 py-1 text-xs font-medium transition-shadow ${
                    statusFilter === s.value
                      ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 shadow-neu-pressed-sm'
                      : 'bg-base text-slate-600 dark:text-slate-400 shadow-neu-flat-sm hover:text-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {s.label}
                  {counts[s.value] !== null && <span className="ml-1 text-slate-600 dark:text-slate-400">({counts[s.value]})</span>}
                </button>
              ))}
            </div>
          </div>

          <FormError>{rowsError}</FormError>

          {/* ADM3: cards on phones (stack-table), a table from `sm`. */}
          <div className="rounded-xl sm:overflow-x-auto sm:bg-base sm:shadow-neu-pressed-sm">
            <Table className="stack-table">
              <TableHeader>
                <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelectableChecked}
                      onCheckedChange={toggleSelectAll}
                      disabled={selectableRows.length === 0}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">TagBack ID</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">Physical UID</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">Chip</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">Write status</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">Content</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">Registered</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-400">Owner</TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading &&
                  [0, 1, 2, 3, 4].map((i) => (
                    <TableRow key={i} className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
                        <TableCell key={c}>
                          <Skeleton className="h-4 w-full max-w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!rowsLoading && filteredRows.length === 0 && (
                  <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                    <TableCell colSpan={10} data-full className="py-10 text-center text-slate-600 dark:text-slate-400">
                      {rows.length === 0 && !search ? 'No NFC tags have been registered yet.' : 'No tags match this view.'}{' '}
                      <Link to="/admin/nfc-register" className="font-semibold text-purple-600 hover:text-pink-600">
                        Register a physical tap
                      </Link>{' '}
                      to add inventory.
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map((t) => {
                  const created = toDate(t.registeredAt);
                  const lookup = ownerLookup[t.tagId];
                  return (
                    <TableRow key={t.tagId} className="border-slate-200 dark:border-slate-700/60 hover:bg-slate-900/5 dark:hover:bg-white/5">
                      <TableCell data-label="Select">
                        <Checkbox
                          checked={selectedIds.has(t.tagId)}
                          onCheckedChange={() => toggleSelected(t.tagId)}
                          disabled={t.status === 'blacklisted'}
                          aria-label={`Select ${t.tagId}`}
                        />
                      </TableCell>
                      <TableCell data-label="TagBack ID" className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100" title={t.tagId}>
                        {t.tagId}
                      </TableCell>
                      <TableCell data-label="Physical UID" className="font-mono text-xs text-slate-600 dark:text-slate-300" title={t.physicalUid || ''}>
                        {t.physicalUid || '—'}
                      </TableCell>
                      <TableCell data-label="Chip" className="text-slate-600 dark:text-slate-300">{t.chipType || '—'}</TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge state={t.status || 'registered'} />
                      </TableCell>
                      <TableCell data-label="Write status">
                        <StatusBadge
                          state={WRITE_STATUS_LABEL[t.writeStatus] ? t.writeStatus : 'not_written'}
                          label={WRITE_STATUS_LABEL[t.writeStatus] || WRITE_STATUS_LABEL.not_written}
                        />
                      </TableCell>
                      <TableCell
                        data-label="Tap shows"
                        className="max-w-48 truncate text-xs text-slate-600 dark:text-slate-300"
                        title={profiles[t.tagId]?.redirectUrl || contentLabel(profiles[t.tagId])}
                      >
                        {contentLabel(profiles[t.tagId])}
                      </TableCell>
                      <TableCell data-label="Registered" className="text-slate-600 dark:text-slate-400" title={created ? created.toLocaleString() : ''}>
                        {created ? relativeTimeFromMs(toMillis(created)) : '—'}
                      </TableCell>
                      <TableCell data-label="Owner" className="text-slate-600 dark:text-slate-300">
                        {t.status !== 'claimed' ? (
                          '—'
                        ) : lookup?.owner ? (
                          <span className="text-xs" title="Sign-up email (checked against the login by the database rules)">{lookup.owner.email || lookup.owner.uid}</span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto px-1.5 py-0.5 text-xs"
                            disabled={lookup?.loading}
                            onClick={() => onRevealOwner(t.tagId)}
                          >
                            {lookup?.loading ? 'Loading…' : 'Reveal owner'}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell data-label="Actions" className="text-right">
                        {/* Every row action lives in one ⋯ menu instead of up to
                            five buttons wrapping across lines. */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${t.tagId}`}
                              disabled={unblacklistBusy === t.tagId}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-52 rounded-xl border-slate-200 dark:border-slate-700 [&_[role=menuitem]]:cursor-pointer [&_[role=menuitem]]:outline-none"
                          >
                            {t.status !== 'blacklisted' && (
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/tags/${encodeURIComponent(t.tagId)}`}>
                                  <PencilLine /> Edit content
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => onCopyUrl(t.tagId)}>
                              <Copy /> Copy URL
                            </DropdownMenuItem>
                            {t.status !== 'blacklisted' &&
                              (t.writeStatus === 'write_failed' || t.writeStatus === 'not_written' || !t.writeStatus) && (
                                <DropdownMenuItem asChild>
                                  <Link to={`/admin/nfc-register?rewrite=${encodeURIComponent(t.tagId)}`}>
                                    <RefreshCw /> Retry write
                                  </Link>
                                </DropdownMenuItem>
                              )}
                            {t.status !== 'blacklisted' && (
                              <DropdownMenuItem asChild>
                                <Link
                                  to={`/admin/nfc-register?reregister=${encodeURIComponent(t.tagId)}`}
                                  title="Sticker lost, damaged, or swapped — re-point this TagBack ID at a new physical tap"
                                >
                                  <Nfc /> Re-register sticker
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {t.status !== 'blacklisted' ? (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => {
                                  setBlacklistTarget(t.tagId);
                                  setFlagReason('');
                                }}
                              >
                                <Ban /> Blacklist…
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-emerald-600 dark:text-emerald-400"
                                onSelect={() => onUnblacklist(t)}
                              >
                                <Undo2 className="text-emerald-600 dark:text-emerald-400" /> Unblacklist
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {hasMore && !rowsLoading && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMoreRows} disabled={rowsMoreLoading}>
                {rowsMoreLoading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!blacklistTarget} onOpenChange={(open) => !open && setBlacklistTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blacklistTarget === '__bulk__' ? `Blacklist ${selectedIds.size} tags` : 'Blacklist tag'}</DialogTitle>
            <DialogDescription>
              {blacklistTarget === '__bulk__'
                ? 'This marks every selected tag as blacklisted so none of them can be claimed or resolved.'
                : 'This marks the tag as blacklisted so it can no longer be claimed or resolved.'}
              {blacklistTarget && blacklistTarget !== '__bulk__' && (
                <span className="mt-1 block font-mono text-xs text-slate-600 dark:text-slate-400">{blacklistTarget}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="blacklist-reason" className="text-slate-600 dark:text-slate-300">Reason (required)</Label>
            <Input
              id="blacklist-reason"
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
            <Button variant="destructive" onClick={onConfirmBlacklist} disabled={blacklistBusy || !flagReason.trim()}>
              {blacklistBusy ? 'Blacklisting…' : blacklistTarget === '__bulk__' ? `Blacklist ${selectedIds.size} tags` : 'Blacklist tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
