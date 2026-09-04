import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { firebaseReady } from '../../firebase/config';
import {
  useOwnerItems,
  useOwnerTagIds,
  useOwnerOpenReports,
  toggleLostMode,
} from '../../lib/ownerItems';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
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

const glass = 'bg-white/70 backdrop-blur-xl';

export default function Items() {
  const { user } = useAuth();
  const { items, loading, updateMockItem } = useOwnerItems(user);
  const { tagIds } = useOwnerTagIds(user);
  const { reports } = useOwnerOpenReports(tagIds);
  const openTagSet = useMemo(() => new Set(reports.map((r) => r.tagId)), [reports]);

  // { tagId, name, lostMessage, rewardAmount } while the "declare lost" dialog is open, else null.
  const [armDialog, setArmDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  async function onToggle(item, checked) {
    if (checked) {
      setArmDialog({
        tagId: item.tagId,
        name: item.itemName,
        lostMessage: item.lostMessage || '',
        rewardAmount: item.rewardAmount || 0,
      });
      return;
    }
    try {
      if (firebaseReady) {
        await toggleLostMode(item.tagId, false, { lostMessage: '', rewardAmount: 0 });
      } else {
        updateMockItem(item.tagId, { isLostMode: false, lostSince: null, lostMessage: '', rewardAmount: 0 });
      }
    } catch (err) {
      alert('Could not update item: ' + err.message);
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
    } catch (err) {
      alert('Could not update item: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-800">My items</h1>
        <Button asChild variant="secondary">
          <Link to="/dashboard/items/claim">+ Claim a tag</Link>
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading your items…</p>}

      {!loading && items.length === 0 && (
        <Card className={`${glass} rounded-3xl`}>
          <CardContent className="p-0 text-center text-sm text-slate-500">
            No items yet. Claim your first NFC tag to get started.
          </CardContent>
        </Card>
      )}

      {items.map((it) => (
        <Card
          key={it.tagId}
          className={
            it.isLostMode
              ? 'rounded-2xl border-2 border-red-400 bg-red-50/60 p-6 shadow-[0_0_24px_rgba(239,68,68,0.25)]'
              : `${glass} rounded-3xl p-6`
          }
        >
          <CardContent className="flex items-center justify-between gap-4 p-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold text-slate-800">{it.itemName}</p>
                {it.isLostMode && <Badge variant="destructive">Lost</Badge>}
                {openTagSet.has(it.tagId) && <Badge variant="outline">Found reported</Badge>}
              </div>
              {it.isLostMode && (it.lostMessage || it.rewardAmount > 0) && (
                <p className="mt-1 truncate text-xs font-semibold text-amber-600">
                  {it.rewardAmount > 0 ? `$${it.rewardAmount} reward` : ''}
                  {it.rewardAmount > 0 && it.lostMessage ? ' — ' : ''}
                  {it.lostMessage}
                </p>
              )}
              <p className="mt-1 truncate text-xs text-slate-500">Tag: {it.tagId}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-slate-500">{it.isLostMode ? 'Lost mode' : 'Safe'}</span>
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
    </div>
  );
}
