import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ShieldCheck, CheckCheck, Eye, Flag, ShieldBan } from 'lucide-react';
import { toast } from 'sonner';
import { useModerationQueue, banToken, unbanToken, markChatReviewed } from '../../lib/moderation';
import { notifyOwner } from '../../lib/ownerItems';
import { relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

// §4.13/§5.4. Real live data: chats an owner reported (chats.blocked, set
// from public/Chat.jsx) joined against items for a display name. Listed
// entries are a review log, not a to-do list — banning/unbanning the token
// doesn't remove a row, since the report itself already happened.
//
// Known limitation: a ban is keyed on finderSessionToken, a localStorage-
// scoped identity (see lib/finderSession.js) — clearing site data or using a
// different browser trivially gets a new token past a ban. Strengthening
// this needs a stronger finder identity (e.g. device/IP signal), out of
// scope for this pass.
export default function Moderation() {
  const { chats, items, bannedTokens, loading, toggleMockBan } = useModerationQueue();
  const [search, setSearch] = useState('');
  const [showReviewed, setShowReviewed] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkReviewing, setBulkReviewing] = useState(false);

  const visibleChats = useMemo(
    () => (showReviewed ? chats : chats.filter((c) => !c.reviewedAt)),
    [chats, showReviewed]
  );

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return visibleChats;
    return visibleChats.filter((chat) => {
      const itemName = items[chat.tagId]?.itemName || '';
      return (
        itemName.toLowerCase().includes(term) ||
        (chat.blockedReason || '').toLowerCase().includes(term) ||
        (chat.finderSessionToken || '').toLowerCase().includes(term)
      );
    });
  }, [visibleChats, items, search]);

  const reviewedCount = chats.length - visibleChats.length;
  const reviewedTotal = useMemo(() => chats.filter((c) => c.reviewedAt).length, [chats]);
  const bannedTotal = bannedTokens.size;

  // Bulk mark-reviewed only ever offers rows that are both currently
  // filtered into view and not already reviewed.
  const selectableChats = useMemo(() => filteredChats.filter((c) => !c.reviewedAt), [filteredChats]);
  const allSelectableChecked = selectableChats.length > 0 && selectableChats.every((c) => selectedIds.has(c.id));

  function toggleSelected(chatId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelectableChecked ? new Set() : new Set(selectableChats.map((c) => c.id)));
  }

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, showReviewed]);

  async function onBulkMarkReviewed() {
    setBulkReviewing(true);
    try {
      await Promise.all([...selectedIds].map((id) => markChatReviewed(id)));
      toast.success(`Marked ${selectedIds.size} reviewed.`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error('Could not mark all reviewed: ' + err.message);
    } finally {
      setBulkReviewing(false);
    }
  }

  async function onToggleBan(chat) {
    const token = chat.finderSessionToken;
    const banned = bannedTokens.has(token);
    try {
      if (banned) {
        await unbanToken(token);
      } else {
        await banToken(token, { tagId: chat.tagId, reason: chat.blockedReason });
        // Close the loop: the owner reported this chat (chats.blocked), so
        // let them know the report was acted on instead of leaving them to
        // notice silently that the finder went quiet.
        await notifyOwner({ type: 'moderation_resolved', tagId: chat.tagId, chatId: chat.id });
      }
      toggleMockBan(token);
      toast.success(banned ? 'Token unbanned.' : 'Token banned.');
    } catch (err) {
      toast.error('Could not update ban status: ' + err.message);
    }
  }

  async function onMarkReviewed(chat) {
    setReviewingId(chat.id);
    try {
      await markChatReviewed(chat.id);
      toast.success('Marked reviewed.');
    } catch (err) {
      toast.error('Could not mark reviewed: ' + err.message);
    } finally {
      setReviewingId('');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Moderation</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Conversations owners have reported. Banning a finder's session token blocks it from
          filing new reports or sending new messages anywhere in the app.
        </p>
      </div>

      {!loading && chats.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/80 dark:bg-white/5 p-4 shadow-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <Flag className="h-4.5 w-4.5" />
            </span>
            <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reported</div>
            <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{chats.length}</div>
          </div>
          <div className="rounded-2xl bg-white/80 dark:bg-white/5 p-4 shadow-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
              <CheckCheck className="h-4.5 w-4.5" />
            </span>
            <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reviewed</div>
            <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{reviewedTotal}</div>
          </div>
          <div className="rounded-2xl bg-white/80 dark:bg-white/5 p-4 shadow-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300">
              <ShieldBan className="h-4.5 w-4.5" />
            </span>
            <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Banned tokens</div>
            <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{bannedTotal}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && chats.length === 0 && (
        <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShieldCheck className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            <p className="font-bold text-slate-800 dark:text-slate-100">Nothing reported.</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Chats an owner reports as abusive show up here.</p>
          </CardContent>
        </Card>
      )}

      {chats.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search by item, reason, or finder token…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <label className="flex items-center gap-2 rounded-full bg-base px-3 py-1.5 shadow-neu-flat-sm">
              <Switch checked={showReviewed} onCheckedChange={setShowReviewed} />
              <Label className="text-slate-600 dark:text-slate-300">
                Show reviewed {reviewedCount > 0 && `(${reviewedCount})`}
              </Label>
            </label>
            {selectedIds.size > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={bulkReviewing}
                onClick={onBulkMarkReviewed}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {bulkReviewing ? 'Marking…' : `Mark ${selectedIds.size} reviewed`}
              </Button>
            )}
          </div>
          {visibleChats.length === 0 && (
            <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <CheckCheck className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                <p className="font-bold text-slate-800 dark:text-slate-100">All caught up.</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Every report has been reviewed. Toggle "Show reviewed" to see them again.
                </p>
              </CardContent>
            </Card>
          )}
          {visibleChats.length > 0 && (
          <div className="overflow-x-auto rounded-2xl bg-white/80 dark:bg-white/5 shadow-lg">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelectableChecked}
                    onCheckedChange={toggleSelectAll}
                    disabled={selectableChats.length === 0}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Finder token</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChats.length === 0 && (
                <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No reports match this search.
                  </TableCell>
                </TableRow>
              )}
              {filteredChats.map((chat) => {
                const banned = bannedTokens.has(chat.finderSessionToken);
                const reviewed = !!chat.reviewedAt;
                return (
                  <TableRow key={chat.id} className="border-slate-200 dark:border-slate-700/60">
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(chat.id)}
                        onCheckedChange={() => toggleSelected(chat.id)}
                        disabled={reviewed}
                        aria-label={`Select report for ${items[chat.tagId]?.itemName || chat.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{items[chat.tagId]?.itemName || 'Unknown item'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-amber-200 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300">
                        {chat.blockedReason || 'No reason given'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {chat.finderSessionToken}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 dark:text-slate-500">
                      {relativeTimeFromMs(toMillis(chat.blockedAt))}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {banned ? (
                          <Badge variant="destructive">Banned</Badge>
                        ) : (
                          <Badge variant="outline">Active</Badge>
                        )}
                        {reviewed && <Badge variant="secondary">Reviewed</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* View chat / Mark reviewed are icon-only — this row
                          can carry up to 2 badges + 3 actions, and text
                          labels on all three crowded narrow viewports.
                          Ban/Unban keeps its label: it's the one action per
                          row worth a second of hesitation before clicking. */}
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button type="button" size="icon" variant="outline" title="View chat" asChild>
                          <Link to={`/chat/${chat.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        {!reviewed && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            title={reviewingId === chat.id ? 'Marking…' : 'Mark reviewed'}
                            disabled={reviewingId === chat.id}
                            onClick={() => onMarkReviewed(chat)}
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant={banned ? 'outline' : 'destructive'}
                          className="gap-1.5"
                          onClick={() => onToggleBan(chat)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          {banned ? 'Unban' : 'Ban token'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          )}
        </>
      )}
    </div>
  );
}
