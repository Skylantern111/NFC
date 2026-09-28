import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Eye, MessageSquare, MoreVertical, Nfc, PackageSearch, PencilLine, SearchX, ShieldCheck, Unlink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOwnerNotificationsContext } from '../../context/OwnerNotificationsContext';
import { firebaseReady } from '../../firebase/config';
import {
  useOwnerItems,
  useOwnerTagIds,
  useOwnerOpenReports,
  toggleLostMode,
  releaseTag,
  getTagScanCount,
} from '../../lib/ownerItems';
import { CATEGORY_ICON } from '../../lib/categories';
import { cn, formatReward, friendlyFirestoreError } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import PageHeader from '../../components/PageHeader';
import StatusBadge, { itemStatus } from '../../components/StatusBadge';
import FormField from '../../components/FormField';
import ConfirmDialog from '../../components/ConfirmDialog';
import { EmptyState, InlineAlert, SkeletonList } from '../../components/States';

// Search only earns its space on a longer list (UI_UX_IMPROVEMENT_PLAN.md ITEM8).
const SEARCH_MIN_ITEMS = 6;

export default function Items() {
  const { user } = useAuth();
  const { items, loading, updateMockItem } = useOwnerItems(user);
  const { tagIds } = useOwnerTagIds(user);
  const { reports } = useOwnerOpenReports(tagIds);
  const { chats } = useOwnerNotificationsContext();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const lostOnly = params.get('filter') === 'lost';

  // Right after a claim (ClaimTag.jsx), highlight the new item and point at
  // its next step (NFC7 / GUIDE2).
  const [justClaimed, setJustClaimed] = useState(location.state?.claimed || null);
  const claimedRef = useRef(null);
  useEffect(() => {
    if (justClaimed && claimedRef.current) claimedRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [justClaimed, items.length]);

  // ITEM7: jump from an item straight to the finder's chat.
  const chatByTag = useMemo(() => {
    const openReportIds = new Set(reports.map((r) => r.id));
    const out = {};
    for (const c of chats) if (c.reportId && openReportIds.has(c.reportId) && !out[c.tagId]) out[c.tagId] = c;
    return out;
  }, [reports, chats]);
  const openTagSet = useMemo(() => new Set(reports.map((r) => r.tagId)), [reports]);

  const [search, setSearch] = useState('');
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(
      (it) =>
        (!lostOnly || it.isLostMode) &&
        (!term || it.itemName?.toLowerCase().includes(term) || it.tagId?.toLowerCase().includes(term))
    );
  }, [items, search, lostOnly]);

  const [armDialog, setArmDialog] = useState(null); // { tagId, name, lostMessage, rewardAmount }
  const [disarmDialog, setDisarmDialog] = useState(null); // { tagId, name }
  const [releaseDialog, setReleaseDialog] = useState(null); // { tagId, name }
  const [saving, setSaving] = useState(false);
  const [disarming, setDisarming] = useState(false);
  const [releasing, setReleasing] = useState(false);

  // Best-effort tap counts (MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md §4.1).
  const [scanCounts, setScanCounts] = useState({});
  useEffect(() => {
    if (!firebaseReady) return;
    let live = true;
    visibleItems.forEach((it) => {
      if (scanCounts[it.tagId] !== undefined) return;
      getTagScanCount(it.tagId).then((count) => {
        if (live) setScanCounts((prev) => ({ ...prev, [it.tagId]: count }));
      });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.map((it) => it.tagId).join(',')]);

  async function confirmRelease() {
    if (!releaseDialog) return;
    setReleasing(true);
    try {
      await releaseTag(releaseDialog.tagId);
      setReleaseDialog(null);
      toast.success('Tag released. It can be claimed again with the same TagBack ID.');
    } catch (err) {
      toast.error(
        err.code === 'release-not-allowed'
          ? err.message
          : err.code === 'release-partial'
          ? "This tag's reports, chats and alerts were cleared, but releasing it failed. It's still yours — try Release again."
          : friendlyFirestoreError(err, 'Could not release this tag. Try again.')
      );
    } finally {
      setReleasing(false);
    }
  }

  function openArm(item) {
    setArmDialog({
      tagId: item.tagId,
      name: item.itemName,
      lostMessage: item.lostMessage || '',
      rewardAmount: item.rewardAmount || 0,
    });
  }

  // Turning Lost Mode off only clears isLostMode/lostSince — the drafted
  // message and reward stay so re-arming prefills them.
  async function confirmDisarm() {
    if (!disarmDialog) return;
    setDisarming(true);
    try {
      if (firebaseReady) {
        await toggleLostMode(disarmDialog.tagId, false, {});
      } else {
        updateMockItem(disarmDialog.tagId, { isLostMode: false, lostSince: null });
      }
      setDisarmDialog(null);
      toast.success('Lost Mode is off.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not update item. Try again.'));
    } finally {
      setDisarming(false);
    }
  }

  async function confirmArm(e) {
    e.preventDefault();
    if (!armDialog) return;
    setSaving(true);
    try {
      const patch = { lostMessage: armDialog.lostMessage, rewardAmount: Number(armDialog.rewardAmount) || 0 };
      if (firebaseReady) {
        await toggleLostMode(armDialog.tagId, true, patch);
      } else {
        updateMockItem(armDialog.tagId, { ...patch, isLostMode: true, lostSince: { toMillis: () => Date.now() } });
      }
      setArmDialog(null);
      toast.success('Lost Mode is on. Anyone who taps the tag now sees your message.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not update item. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Items"
        description="Everything with a TagBack tag on it."
        actions={
          items.length > 0 && (
            <Button asChild variant="primary">
              <Link to="/dashboard/items/claim">
                <Nfc className="h-4 w-4" /> Claim a tag
              </Link>
            </Button>
          )
        }
      />

      {loading && <SkeletonList count={3} className="h-28" />}

      {!loading && items.length === 0 && (
        <EmptyState
          icon={PackageSearch}
          title="No items yet"
          description="Claim an NFC tag to start protecting your belongings."
          action={
            <Button asChild variant="primary">
              <Link to="/dashboard/items/claim">Claim your first tag</Link>
            </Button>
          }
        />
      )}

      {!loading && items.length > 0 && (items.length >= SEARCH_MIN_ITEMS || lostOnly) && (
        <div className="flex flex-wrap items-center gap-2">
          {items.length >= SEARCH_MIN_ITEMS && (
            <Input
              type="search"
              aria-label="Search items"
              placeholder="Search by item name or TagBack ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          )}
          {lostOnly && (
            <Button type="button" variant="outline" size="sm" onClick={() => setParams({})}>
              Showing lost items only · Show all
            </Button>
          )}
        </div>
      )}

      {!loading && items.length > 0 && visibleItems.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={lostOnly && !search ? 'Nothing is lost' : `No items match "${search}"`}
          description={lostOnly && !search ? 'None of your items are in Lost Mode.' : undefined}
        />
      )}

      <ul className="space-y-3">
        {visibleItems.map((it) => {
          const status = itemStatus(it, openTagSet.has(it.tagId));
          const chat = chatByTag[it.tagId];
          const CategoryIcon = CATEGORY_ICON[it.category];
          const flagged = it.tagStatus === 'blacklisted';
          const highlighted = justClaimed === it.tagId;
          return (
            <li
              key={it.tagId}
              ref={highlighted ? claimedRef : undefined}
              className={cn(
                'glass p-4 sm:p-5',
                it.isLostMode && 'border-2 border-red-400 dark:border-red-500/50 bg-red-50/70 dark:bg-red-500/10',
                highlighted && 'ring-2 ring-purple-500 ring-offset-2 ring-offset-transparent'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="break-words text-base font-bold text-slate-800 dark:text-slate-100">{it.itemName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <StatusBadge state={status} />
                    {it.category && (
                      <span className="inline-flex items-center gap-1">
                        {CategoryIcon && <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                        {it.category}
                      </span>
                    )}
                    <span className="font-mono">{it.tagId}</span>
                    {scanCounts[it.tagId] > 0 && (
                      <span className="inline-flex items-center gap-1" title="Times this tag's page has been opened">
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {scanCounts[it.tagId]}
                        <span className="sr-only">taps</span>
                      </span>
                    )}
                  </div>
                  {it.isLostMode && (it.lostMessage || it.rewardAmount > 0) && (
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {it.rewardAmount > 0 && (
                        <span className="font-semibold text-warning">Reward {formatReward(it.rewardAmount)}. </span>
                      )}
                      {it.lostMessage}
                    </p>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label={`More actions for ${it.itemName}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to={`/dashboard/nfc-setup?tagId=${encodeURIComponent(it.tagId)}`}>
                        <PencilLine className="h-4 w-4" /> Edit tap page
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={`/nfc/${encodeURIComponent(it.tagId)}?preview=1`} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-4 w-4" /> Preview what finders see
                      </Link>
                    </DropdownMenuItem>
                    {/* SYSTEM_AUDIT_ROUND3.md C1: the rules refuse to release a
                        blacklisted tag, so don't offer it (releaseTag also checks). */}
                    {!flagged && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setReleaseDialog({ tagId: it.tagId, name: it.itemName })}
                          className="text-red-700 focus:text-red-700 dark:text-red-300"
                        >
                          <Unlink className="h-4 w-4" /> Release tag…
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {highlighted && !it.isLostMode && (
                <InlineAlert tone="success" className="mt-3" title="Tag claimed">
                  It's protected now. If it ever goes missing, tap <strong>Report lost</strong>.
                </InlineAlert>
              )}

              {/* One clear next action per state (ITEM1/ITEM7). */}
              {!flagged && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {chat && (
                    <Button asChild variant="primary" size="sm">
                      <Link to={`/chat/${chat.id}`}>
                        <MessageSquare className="h-4 w-4" /> Reply to finder
                      </Link>
                    </Button>
                  )}
                  {it.isLostMode ? (
                    <>
                      <Button type="button" size="sm" variant="secondary" onClick={() => openArm(it)}>
                        Edit lost message
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDisarmDialog({ tagId: it.tagId, name: it.itemName })}
                      >
                        <ShieldCheck className="h-4 w-4" /> I have it back
                      </Button>
                    </>
                  ) : (
                    !chat && (
                      <Button
                        type="button"
                        size="sm"
                        variant={highlighted ? 'primary' : 'secondary'}
                        onClick={() => {
                          setJustClaimed(null);
                          openArm(it);
                        }}
                      >
                        <AlertTriangle className="h-4 w-4" /> Report lost
                      </Button>
                    )
                  )}
                </div>
              )}
              {flagged && (
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                  An admin flagged this tag, so finders can't report or message on it. Contact TagBack if this seems wrong.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!armDialog} onOpenChange={(open) => !open && !saving && setArmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report "{armDialog?.name}" as lost</DialogTitle>
            <DialogDescription>
              Anyone who taps the tag will see that it's lost, plus the message and reward below. They can message
              you through TagBack — your contact details stay hidden.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmArm} className="flex flex-col gap-4">
            <FormField
              id="lostMessage"
              label="Message to the finder"
              optional
              counter={`${(armDialog?.lostMessage || '').length}/500`}
              hint="Say where to leave it or how you'd like to get it back."
            >
              <Textarea
                rows={3}
                maxLength={500}
                value={armDialog?.lostMessage || ''}
                onChange={(e) => setArmDialog((d) => ({ ...d, lostMessage: e.target.value }))}
                placeholder="e.g. Please leave it at the guard house. Thank you!"
              />
            </FormField>
            <FormField id="rewardAmount" label="Reward (₱)" optional>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                max="1000000"
                value={armDialog?.rewardAmount || ''}
                onChange={(e) => setArmDialog((d) => ({ ...d, rewardAmount: e.target.value }))}
                placeholder="e.g. 500"
              />
            </FormField>
            {(armDialog?.lostMessage || Number(armDialog?.rewardAmount) > 0) && (
              <div className="rounded-2xl bg-base px-4 py-3 text-sm shadow-neu-pressed-sm">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Finders will see</p>
                <p className="mt-1 text-slate-800 dark:text-slate-100">
                  {Number(armDialog?.rewardAmount) > 0 && <strong>Reward {formatReward(armDialog.rewardAmount)}. </strong>}
                  {armDialog?.lostMessage}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setArmDialog(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? 'Saving…' : 'Turn on Lost Mode'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!disarmDialog}
        onOpenChange={(open) => !open && setDisarmDialog(null)}
        title={`Turn off Lost Mode for "${disarmDialog?.name}"?`}
        description="The tag page will stop showing it as lost. Your message and reward are kept, so they fill in again next time."
        confirmLabel="Turn off Lost Mode"
        busyLabel="Saving…"
        tone="primary"
        busy={disarming}
        onConfirm={confirmDisarm}
      />

      <ConfirmDialog
        open={!!releaseDialog}
        onOpenChange={(open) => !open && setReleaseDialog(null)}
        title={`Release "${releaseDialog?.name}"?`}
        description={
          <>
            <p>This unlinks the tag from your account and deletes for good:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>the item name, tap page and lost message</li>
              <li>every finder report, chat and notification for this tag</li>
            </ul>
            <p>
              The sticker itself doesn't change and doesn't need rewriting. You or someone else can claim it again with
              the same TagBack ID.
            </p>
          </>
        }
        irreversible
        confirmLabel="Release tag"
        busyLabel="Releasing…"
        busy={releasing}
        onConfirm={confirmRelease}
      />
    </div>
  );
}
