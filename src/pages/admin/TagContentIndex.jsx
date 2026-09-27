import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { ExternalLink, Loader2, PencilLine, Search } from 'lucide-react';
import { db, firebaseReady } from '../../firebase/config';
import { LANDING_MODES, contentLabel } from '../../lib/tagContent';
import { normalizeTagbackId, TAG_STATUS_BADGE } from '../../lib/tags';
import { chunk } from '../../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const CARD = 'rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg';
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
        if (live) setError(err.message || 'Could not load tags.');
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
      setError(err.message || 'Could not load more tags.');
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
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Tag Content</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose what a tap shows — Lost &amp; Found page, profile card (name, bio, socials, contact), or a redirect.
          Stickers only hold their TagBack link, so changes apply on the next tap with no rewrite.
        </p>
      </div>

      <form onSubmit={onLookup} className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="TagBack ID, e.g. TB-ABCD-2345"
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
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-shadow ${
                    modeFilter === m.value
                      ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 shadow-neu-pressed-sm'
                      : 'bg-base text-slate-500 dark:text-slate-400 shadow-neu-flat-sm hover:text-slate-800 dark:hover:text-slate-100'
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select unclaimed tags to set their content in one go.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="overflow-x-auto rounded-xl bg-base shadow-neu-pressed-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-slate-500 dark:text-slate-400">TagBack ID</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400">Tap shows</TableHead>
                  <TableHead className="text-right text-slate-500 dark:text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading tags…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && visible.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      {firebaseReady ? 'No tags in this view.' : 'Preview mode — no Firestore configured.'}
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((t) => {
                  const profile = profiles[t.tagId];
                  return (
                    <TableRow key={t.tagId} className="border-slate-200 dark:border-slate-700/60 hover:bg-slate-900/5 dark:hover:bg-white/5">
                      <TableCell>
                        {/* Bulk only targets unclaimed tags — never overwrite an owner's content. */}
                        <Checkbox
                          checked={selected.has(t.tagId)}
                          onCheckedChange={() => toggleSelected(t.tagId)}
                          disabled={t.status !== 'registered'}
                          aria-label={`Select ${t.tagId}`}
                          title={t.status !== 'registered' ? 'Owned tags are edited one at a time' : undefined}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-200">{t.tagId}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TAG_STATUS_BADGE[t.status] || TAG_STATUS_BADGE.registered}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-56 truncate text-xs text-slate-600 dark:text-slate-300"
                        title={profile?.redirectUrl || contentLabel(profile)}
                      >
                        {contentLabel(profile)}
                      </TableCell>
                      <TableCell className="text-right">
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
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={moreLoading}>
                {moreLoading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
