import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PackageSearch, SearchX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseReady } from '../../firebase/config';
import {
  useOwnerItems,
  useOwnerTagIds,
  useOwnerOpenReports,
  toggleLostMode,
} from '../../lib/ownerItems';
import { CATEGORY_ICON } from '../../lib/categories';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

const glass = 'bg-white/70 dark:bg-white/5 backdrop-blur-xl';

export default function Items() {
  const { user } = useAuth();
  const { items, loading, updateMockItem } = useOwnerItems(user);
  const { tagIds } = useOwnerTagIds(user);
  const { reports } = useOwnerOpenReports(tagIds);
  const openTagSet = useMemo(() => new Set(reports.map((r) => r.tagId)), [reports]);

  const [search, setSearch] = useState('');
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (it) => it.itemName?.toLowerCase().includes(term) || it.tagId?.toLowerCase().includes(term)
    );
  }, [items, search]);

  // { tagId, name, lostMessage, rewardAmount } while the "declare lost" dialog is open, else null.
  const [armDialog, setArmDialog] = useState(null);
  // { tagId, name } while the "turn off lost mode" confirm dialog is open, else null.
  const [disarmDialog, setDisarmDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [disarming, setDisarming] = useState(false);

  function onToggle(item, checked) {
    if (checked) {
      setArmDialog({
        tagId: item.tagId,
        name: item.itemName,
        lostMessage: item.lostMessage || '',
        rewardAmount: item.rewardAmount || 0,
      });
    } else {
      setDisarmDialog({ tagId: item.tagId, name: item.itemName });
    }
  }

  // Turning Lost Mode off only clears isLostMode/lostSince — the drafted
  // message and reward are kept so re-arming later prefills them instead of
  // forcing the owner to retype (armDialog above already reads item.lostMessage/rewardAmount).
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
      toast.success('Lost Mode turned off.');
    } catch (err) {
      toast.error('Could not update item: ' + err.message);
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
      toast.success('Lost Mode armed.');
    } catch (err) {
      toast.error('Could not update item: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">My items</h1>
        <Button asChild variant="secondary">
          <Link to="/dashboard/items/claim">+ Claim a tag</Link>
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-3xl" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <Card className={`${glass} rounded-3xl`}>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/5 dark:bg-white/5">
              <PackageSearch className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            </span>
            <p className="text-sm text-slate-500 dark:text-slate-400">No items yet. Claim your first NFC tag to get started.</p>
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Input
          placeholder="Search by item name or tag id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      )}

      {!loading && items.length > 0 && visibleItems.length === 0 && (
        <Card className={`${glass} rounded-3xl`}>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/5 dark:bg-white/5">
              <SearchX className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            </span>
            <p className="text-sm text-slate-500 dark:text-slate-400">No items match "{search}".</p>
          </CardContent>
        </Card>
      )}

      {visibleItems.map((it) => (
        <Card
          key={it.tagId}
          className={
            it.isLostMode
              ? 'rounded-3xl border-2 border-red-400 dark:border-red-500/50 bg-red-50/60 dark:bg-red-500/10 p-6 shadow-[0_0_24px_rgba(239,68,68,0.25)]'
              : `${glass} rounded-3xl p-6`
          }
        >
          <CardContent className="flex items-center justify-between gap-4 p-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold text-slate-800 dark:text-slate-100">{it.itemName}</p>
                {it.isLostMode && <Badge variant="destructive">Lost</Badge>}
                {openTagSet.has(it.tagId) && <Badge variant="outline">Found reported</Badge>}
                {it.tagStatus === 'blacklisted' && (
                  <Badge variant="destructive" title="An admin flagged this tag — finders can no longer report or message on it.">
                    Flagged by admin
                  </Badge>
                )}
                {it.category && (() => {
                  const Icon = CATEGORY_ICON[it.category];
                  return (
                    <Badge variant="outline">
                      {Icon && <Icon />}
                      {it.category}
                    </Badge>
                  );
                })()}
              </div>
              {it.isLostMode && (it.lostMessage || it.rewardAmount > 0) && (
                <p className="mt-1 truncate text-xs font-semibold text-amber-600 dark:text-amber-300">
                  {it.rewardAmount > 0 ? `$${it.rewardAmount} reward` : ''}
                  {it.rewardAmount > 0 && it.lostMessage ? ' — ' : ''}
                  {it.lostMessage}
                </p>
              )}
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">Tag: {it.tagId}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{it.isLostMode ? 'Lost mode' : 'Safe'}</span>
              <Switch checked={it.isLostMode} onCheckedChange={(checked) => onToggle(it, checked)} />
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!armDialog} onOpenChange={(open) => !open && setArmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Declare "{armDialog?.name}" lost</DialogTitle>
            <DialogDescription>
              This message is shown publicly to anyone who taps the tag.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmArm} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lostMessage">Message to finder</Label>
              <Textarea
                id="lostMessage"
                rows={3}
                value={armDialog?.lostMessage || ''}
                onChange={(e) => setArmDialog((d) => ({ ...d, lostMessage: e.target.value }))}
                placeholder="e.g. Please call the front desk if found."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rewardAmount">Reward amount (optional)</Label>
              <Input
                id="rewardAmount"
                type="number"
                min="0"
                value={armDialog?.rewardAmount || ''}
                onChange={(e) => setArmDialog((d) => ({ ...d, rewardAmount: e.target.value }))}
                placeholder="20"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setArmDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={saving}>
                {saving ? 'Saving…' : 'Arm lost mode'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!disarmDialog} onOpenChange={(open) => !open && setDisarmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn off Lost Mode for "{disarmDialog?.name}"?</DialogTitle>
            <DialogDescription>
              The tag page will stop showing it as lost. Your reward and message stay saved and
              prefill again next time you arm Lost Mode.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" autoFocus onClick={() => setDisarmDialog(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmDisarm} disabled={disarming}>
              {disarming ? 'Saving…' : 'Turn off Lost Mode'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
