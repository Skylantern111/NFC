import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { ExternalLink, PencilLine, Search } from 'lucide-react';
import { db, firebaseReady } from '../../firebase/config';
import { LANDING_MODES, contentLabel } from '../../lib/tagContent';
import { normalizeTagbackId } from '../../lib/tags';
import { chunk, friendlyFirestoreError } from '../../lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { FormError } from '@/components/FormField';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const CARD = 'rounded-lg border-2 border-foreground bg-card shadow-card';
const ROW_LIMIT = 100;

const MODE_FILTERS = [{ value: 'all', label: 'All' }, ...LANDING_MODES.map(({ value, label }) => ({ value, label }))];

// Admin sidebar entry for tag content (NFC_WRITE_DATA_ADMIN_PLAN.md): every
// non-blacklisted tag with what a tap currently shows, and a way into the
// editor (admin/TagContent.jsx) by row or by typed TagBack ID. Unclaimed rows
// can be selected for a bulk "Set content" (same bulk editor Inventory uses).
export default function TagContentIndex() {
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState('');
  const [modeFilter, setModeFilter] = useState('all');

  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());

  // One page of tags (ROW_LIMIT, newest first) plus their profiles — 30 ids
  // per `in` query, Firestore's limit. SYSTEM_AUDIT_PLAN.md C4: "Load more"
  // pages past the first 100 with a cursor.
  async function loadPage(after) {
    const constraints = [orderBy('registeredAt', 'desc'), ...(after ? [startAfter(after)] : []), limit(ROW_LIMIT)];
    const snap = await getDocs(query(collection(db, 'tags'), ...constraints));
    const rows = snap.docs.map((d) => d.data()).filter((t) => t.status !== 'blacklisted');
    const profileSnaps = await Promise.all(
      chunk(
        rows.map((t) => t.tagId),
        30
      ).map((ids) => getDocs(query(collection(db, 'tagProfiles'), where(documentId(), 'in', ids))))
    );
    const nextProfiles = {};
    for (const ps of profileSnaps) for (const d of ps.docs) nextProfiles[d.id] = d.data();
    return {
      rows,
      profiles: nextProfiles,
      cursor: snap.docs[snap.docs.length - 1] || after,
      hasMore: snap.docs.length === ROW_LIMIT,
    };
  }

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    let live = true;
    (async () => {
      try {
        const page = await loadPage(null);
        if (!live) return;
        setTags(page.rows);
        setProfiles(page.profiles);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      } catch (err) {
        if (live) setError(friendlyFirestoreError(err, 'Could not load tags. Try again.'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function onLoadMore() {
    setMoreLoading(true);
    try {
      const page = await loadPage(cursor);
      setTags((prev) => [...prev, ...page.rows]);
      setProfiles((prev) => ({ ...prev, ...page.profiles }));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(friendlyFirestoreError(err, 'Could not load more tags. Try again.'));
    } finally {
      setMoreLoading(false);
    }
  }

  function toggleSelected(tagId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function onBulk() {
    navigate('/admin/tags/bulk', { state: { tagIds: [...selected], skipped: 0 } });
  }

  const visible = useMemo(
    () =>
      modeFilter === 'all'
        ? tags
        : tags.filter((t) => (profiles[t.tagId]?.landingMode || 'lostfound') === modeFilter),
    [tags, profiles, modeFilter]
  );

  function onLookup(e) {
    e.preventDefault();
    const id = normalizeTagbackId(lookup);
    if (id) navigate(`/admin/tags/${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tag Content"
        tourId="tag-content-header"
        description="Choose what a tap shows — the Lost & Found page, a profile card, or a redirect. Stickers only hold their TagBack link, so changes apply on the next tap with no rewrite."
      />

      <form onSubmit={onLookup} className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="TagBack ID"
          placeholder="TagBack ID, e.g. TB-ABCD-2345"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
          className="max-w-md font-mono text-sm"
        />
        <Button type="submit" disabled={!lookup.trim()} className="gap-1.5">
          <Search className="h-4 w-4" /> Open editor
        </Button>
      </form>

      <Card className={CARD}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {MODE_FILTERS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModeFilter(m.value)}
                  aria-pressed={modeFilter === m.value}
                  className={`min-h-9 rounded-md border-2 border-foreground px-3 text-sm font-bold transition-all ${
                    modeFilter === m.value
                      ? 'bg-primary text-primary-foreground shadow-brut-sm'
                      : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {selected.size > 0 ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={onBulk}>
                <PencilLine className="h-3.5 w-3.5" /> Set content ({selected.size})
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select unclaimed tags to set their content in one go.
              </p>
            )}
          </div>

          <FormError>{error}</FormError>

          <div className="rounded-md sm:overflow-x-auto sm:bg-card sm:border-2 sm:border-foreground">
            <Table className="stack-table">
              <TableHeader>
                <TableRow className="border-foreground hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-muted-foreground">TagBack ID</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Tap shows</TableHead>
                  <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* ADM7: skeleton rows, like the other admin tables. */}
                {loading &&
                  [0, 1, 2, 3].map((i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      {[0, 1, 2, 3, 4].map((c) => (
                        <TableCell key={c}>
                          <Skeleton className="h-4 w-full max-w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!loading && visible.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} data-full className="py-8 text-center text-muted-foreground">
                      {firebaseReady ? 'No tags in this view.' : 'Preview mode — no Firestore configured.'}
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((t) => {
                  const profile = profiles[t.tagId];
                  return (
                    <TableRow key={t.tagId} className="border-foreground hover:bg-muted">
                      <TableCell data-label="Select">
                        {/* Bulk only targets unclaimed tags — never overwrite an owner's content. */}
                        <Checkbox
                          checked={selected.has(t.tagId)}
                          onCheckedChange={() => toggleSelected(t.tagId)}
                          disabled={t.status !== 'registered'}
                          aria-label={`Select ${t.tagId}`}
                          title={t.status !== 'registered' ? 'Owned tags are edited one at a time' : undefined}
                        />
                      </TableCell>
                      <TableCell data-label="TagBack ID" className="font-mono text-xs font-semibold text-foreground">{t.tagId}</TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge state={t.status || 'registered'} />
                      </TableCell>
                      <TableCell
                        data-label="Tap shows"
                        className="max-w-56 truncate text-xs text-muted-foreground"
                        title={profile?.redirectUrl || contentLabel(profile)}
                      >
                        {contentLabel(profile)}
                      </TableCell>
                      <TableCell data-label="Actions" className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <Link to={`/admin/tags/${encodeURIComponent(t.tagId)}`}>
                              <PencilLine className="h-3.5 w-3.5" /> Edit content
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <Link to={`/nfc/${t.tagId}?preview=1`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!loading && hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={onLoadMore} loading={moreLoading}>
                {moreLoading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
