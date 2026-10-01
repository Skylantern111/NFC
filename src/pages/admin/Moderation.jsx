import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ShieldCheck, CheckCheck, Eye, Flag, ShieldBan, UserSearch } from 'lucide-react';
import { toast } from 'sonner';
import { useModerationQueue, banToken, unbanToken, markChatReviewed, chatReports, hasReportFrom } from '../../lib/moderation';
import { notifyOwner } from '../../lib/ownerItems';
import { friendlyFirestoreError, relativeTimeFromMs, toMillis } from '../../lib/utils';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { EmptyState, SkeletonList } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  // UI_UX_IMPROVEMENT_PLAN.md ADM1: ban/unban now asks first.
  const [banTarget, setBanTarget] = useState(null); // the chat whose token is being (un)banned
  const [banBusy, setBanBusy] = useState(false);

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
        chatReports(chat).some((r) => (r.reason || '').toLowerCase().includes(term)) ||
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
      toast.error(friendlyFirestoreError(err, 'Could not mark them reviewed. Try again.'));
    } finally {
      setBulkReviewing(false);
    }
  }

  async function onToggleBan(chat) {
    const token = chat.finderSessionToken;
    const banned = bannedTokens.has(token);
    setBanBusy(true);
    try {
      if (banned) {
        await unbanToken(token);
      } else {
        await banToken(token, {
          tagId: chat.tagId,
          reason: chatReports(chat).find((r) => r.by === 'owner')?.reason || null,
        });
        // Close the loop: the owner reported this chat (chats.blocked), so
        // let them know the report was acted on instead of leaving them to
        // notice silently that the finder went quiet.
        await notifyOwner({ type: 'moderation_resolved', tagId: chat.tagId, chatId: chat.id });
      }
      toggleMockBan(token);
      setBanTarget(null);
      toast.success(banned ? 'Finder unbanned.' : 'Finder banned. The owner was told their report was acted on.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not update the ban. Try again.'));
    } finally {
      setBanBusy(false);
    }
  }

  async function onMarkReviewed(chat) {
    setReviewingId(chat.id);
    try {
      await markChatReviewed(chat.id);
      toast.success('Marked reviewed.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not mark it reviewed. Try again.'));
    } finally {
      setReviewingId('');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Moderation"
        tourId="moderation-header"
        description="Reported conversations. Banning a finder blocks their browser from new reports and messages anywhere in TagBack."
      />

      {!loading && chats.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border-2 border-foreground bg-card p-4 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-warning-soft text-foreground">
              <Flag className="h-4.5 w-4.5" />
            </span>
            <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Reported</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{chats.length}</div>
          </div>
          <div className="rounded-lg border-2 border-foreground bg-card p-4 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-success-soft text-foreground">
              <CheckCheck className="h-4.5 w-4.5" />
            </span>
            <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Reviewed</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{reviewedTotal}</div>
          </div>
          <div className="rounded-lg border-2 border-foreground bg-card p-4 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive-soft text-foreground">
              <ShieldBan className="h-4.5 w-4.5" />
            </span>
            <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Banned tokens</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{bannedTotal}</div>
          </div>
        </div>
      )}

      {loading && <SkeletonList count={3} className="h-16" />}

      {!loading && chats.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing reported"
          description="Chats an owner or finder reports show up here."
        />
      )}

      {chats.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <Input
              type="search"
              aria-label="Search reports"
              placeholder="Search by item, reason, or finder token…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <label className="flex items-center gap-2 rounded-full bg-base px-3 py-1.5 shadow-neu-flat-sm">
              <Switch checked={showReviewed} onCheckedChange={setShowReviewed} />
              <Label className="text-muted-foreground">
                Show reviewed {reviewedCount > 0 && `(${reviewedCount})`}
              </Label>
            </label>
            {selectedIds.size > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                loading={bulkReviewing}
                onClick={onBulkMarkReviewed}
              >
                {!bulkReviewing && <CheckCheck className="h-3.5 w-3.5" />}
                {bulkReviewing ? 'Marking…' : `Mark ${selectedIds.size} reviewed`}
              </Button>
            )}
          </div>
          {visibleChats.length === 0 && (
            <EmptyState
              icon={CheckCheck}
              title="All caught up"
              description='Every report has been reviewed. Turn on "Show reviewed" to see them again.'
            />
          )}
          {visibleChats.length > 0 && (
          <div className="rounded-lg sm:overflow-x-auto sm:border-2 sm:border-foreground sm:bg-card sm:shadow-brut">
          <Table className="stack-table">
            <TableHeader>
              <TableRow className="border-foreground hover:bg-transparent">
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
                <TableRow className="border-foreground hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No reports match this search.
                  </TableCell>
                </TableRow>
              )}
              {filteredChats.map((chat) => {
                const banned = bannedTokens.has(chat.finderSessionToken);
                const reviewed = !!chat.reviewedAt;
                return (
                  <TableRow key={chat.id} className="border-foreground">
                    <TableCell data-label="Select">
                      <Checkbox
                        checked={selectedIds.has(chat.id)}
                        onCheckedChange={() => toggleSelected(chat.id)}
                        disabled={reviewed}
                        aria-label={`Select report for ${items[chat.tagId]?.itemName || chat.id}`}
                      />
                    </TableCell>
                    <TableCell data-label="Item" className="font-semibold text-foreground">{items[chat.tagId]?.itemName || 'Unknown item'}</TableCell>
                    <TableCell data-label="Reason">
                      <div className="flex flex-col items-end gap-1 sm:items-start">
                        {chatReports(chat).map((r) => (
                          <span key={r.by} className="whitespace-normal text-sm text-foreground">
                            <span className="font-semibold">{r.by === 'finder' ? 'Finder: ' : 'Owner: '}</span>
                            {r.reason || 'No reason given'}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell data-label="Finder token" className="max-w-40 truncate font-mono text-xs text-muted-foreground" title={chat.finderSessionToken}>
                      {chat.finderSessionToken}
                    </TableCell>
                    <TableCell data-label="Reported" className="text-xs text-muted-foreground">
                      {(() => {
                        const times = chatReports(chat).map((r) => toMillis(r.at)).filter(Boolean);
                        return times.length ? relativeTimeFromMs(Math.max(...times)) : '—';
                      })()}
                    </TableCell>
                    <TableCell data-label="Status">
                      <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                        {/* Direction matters for which admin action is the
                            right remedy — banning a finder's token is the
                            WRONG fix for a finder-filed report (that bans
                            the person who complained). blockedBy is absent
                            on chats reported before this field existed;
                            those default to 'owner' (the only direction
                            possible at the time). */}
                        {hasReportFrom(chat, 'finder') && <StatusBadge state="review" label="Reported by finder" />}
                        {hasReportFrom(chat, 'owner') && <StatusBadge state="review" label="Reported by owner" />}
                        {chat.archivedAt && <Badge variant="secondary">Tag released</Badge>}
                        {banned && <StatusBadge state="banned" label="Finder banned" />}
                        {reviewed && <StatusBadge state="reviewed" />}
                      </div>
                    </TableCell>
                    <TableCell data-label="Actions">
                      {/* View chat / Mark reviewed are icon-only — this row
                          can carry up to 2 badges + 3 actions, and text
                          labels on all three crowded narrow viewports.
                          Ban/Unban keeps its label: it's the one action per
                          row worth a second of hesitation before clicking. */}
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button type="button" size="icon" variant="outline" title="View chat" aria-label="View chat" asChild>
                          <Link to={`/chat/${chat.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {!reviewed && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            title="Mark reviewed"
                            aria-label="Mark reviewed"
                            loading={reviewingId === chat.id}
                            onClick={() => onMarkReviewed(chat)}
                          >
                            {reviewingId !== chat.id && <CheckCheck className="h-4 w-4" />}
                          </Button>
                        )}
                        {hasReportFrom(chat, 'finder') && (
                          // Banning this chat's finder token would punish the
                          // reporter, not the reported owner — the remedy is
                          // reviewing/disabling the OWNER's account instead.
                          <Button type="button" size="sm" variant="outline" className="gap-1.5" asChild>
                            <Link to={`/admin/owners?tagId=${encodeURIComponent(chat.tagId)}`}>
                              <UserSearch className="h-3.5 w-3.5" /> Look up owner
                            </Link>
                          </Button>
                        )}
                        {hasReportFrom(chat, 'owner') && (
                          <Button
                            type="button"
                            size="sm"
                            variant={banned ? 'outline' : 'destructive'}
                            className="gap-1.5"
                            onClick={() => setBanTarget(chat)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            {banned ? 'Unban' : 'Ban finder'}
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
          )}
        </>
      )}
      <ConfirmDialog
        open={!!banTarget}
        onOpenChange={(open) => !open && setBanTarget(null)}
        title={
          banTarget && bannedTokens.has(banTarget.finderSessionToken)
            ? 'Unban this finder?'
            : `Ban the finder in "${items[banTarget?.tagId]?.itemName || 'this chat'}"?`
        }
        description={
          banTarget && bannedTokens.has(banTarget.finderSessionToken) ? (
            'Their browser will be able to file reports and send messages again.'
          ) : (
            <>
              <p>
                This finder's browser won't be able to file reports or send messages anywhere in TagBack. The owner who
                reported the chat gets a notification that it was acted on.
              </p>
              <p>A finder who clears their browser data gets a new identity, so a ban isn't permanent protection.</p>
            </>
          )
        }
        tone={banTarget && bannedTokens.has(banTarget.finderSessionToken) ? 'primary' : 'destructive'}
        confirmLabel={banTarget && bannedTokens.has(banTarget.finderSessionToken) ? 'Unban' : 'Ban finder'}
        busyLabel="Saving…"
        busy={banBusy}
        onConfirm={() => onToggleBan(banTarget)}
      />
    </div>
  );
}
