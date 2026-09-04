import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useOwnerItems } from '../../lib/ownerItems';
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

const glass = 'border-white/10 bg-white/5 backdrop-blur-xl';

export default function Items() {
  const { user } = useAuth();
  const { items, loading, updateMockItem } = useOwnerItems(user);
  // { tagId, itemName, lostMessage, rewardAmount } while the "declare lost"
  // dialog is open, else null.
  const [armDialog, setArmDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  // Writes only ever carry the exact fields firestore.rules whitelists on
  // items/{tagId}: tagId, itemName, isLostMode, lostMessage, rewardAmount.
  async function writeItem(tagId, patch) {
    if (!firebaseReady) {
      updateMockItem(tagId, patch);
      return;
    }
    await updateDoc(doc(db, 'items', tagId), patch);
  }

  async function onToggle(item, checked) {
    if (checked) {
      setArmDialog({
        tagId: item.tagId,
        itemName: item.itemName,
        lostMessage: item.lostMessage || '',
        rewardAmount: item.rewardAmount || 0,
      });
      return;
    }
    try {
      await writeItem(item.tagId, { isLostMode: false, lostSince: null });
    } catch (err) {
      alert('Could not update item: ' + err.message);
    }
  }

  async function confirmArm(e) {
    e.preventDefault();
    if (!armDialog) return;
    setSaving(true);
    try {
      await writeItem(armDialog.tagId, {
        isLostMode: true,
        lostMessage: armDialog.lostMessage,
        rewardAmount: Number(armDialog.rewardAmount) || 0,
        // Drives the Dashboard "still missing after N days" nudge (§4.5/§5.8).
        lostSince: firebaseReady ? serverTimestamp() : { toMillis: () => Date.now() },
      });
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
        <h1 className="text-2xl font-extrabold drop-shadow-md">My items</h1>
        <Button asChild variant="secondary">
          <Link to="/dashboard/items/claim">+ Claim a tag</Link>
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading your items…</p>}

      {!loading && items.length === 0 && (
        <Card className={glass}>
          <CardContent className="p-0 text-center text-sm text-slate-400">
            No items yet. Claim your first NFC tag to get started.
          </CardContent>
        </Card>
      )}

      {items.map((it) => (
        <Card
          key={it.tagId}
          className={
            it.isLostMode
              ? 'rounded-2xl border-2 border-red-500 bg-red-900/20 p-6 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
              : `${glass} p-6`
          }
        >
          <CardContent className="flex items-center justify-between gap-4 p-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold">{it.itemName}</p>
                {it.isLostMode && <Badge variant="destructive">Lost</Badge>}
              </div>
              {it.isLostMode && it.rewardAmount > 0 && (
                <p className="mt-1 text-xs font-semibold text-amber-300">
                  ${it.rewardAmount} reward offered
                </p>
              )}
              <p className="mt-1 truncate text-xs text-slate-500">Tag: {it.tagId}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-slate-400">{it.isLostMode ? 'Lost mode' : 'Safe'}</span>
              <Switch checked={it.isLostMode} onCheckedChange={(checked) => onToggle(it, checked)} />
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!armDialog} onOpenChange={(open) => !open && setArmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Declare "{armDialog?.itemName}" lost</DialogTitle>
            <DialogDescription>
              This message and reward are shown publicly to anyone who taps the tag.
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
              <Label htmlFor="rewardAmount">Reward amount ($, optional)</Label>
              <Input
                id="rewardAmount"
                type="number"
                min="0"
                step="1"
                value={armDialog?.rewardAmount ?? 0}
                onChange={(e) => setArmDialog((d) => ({ ...d, rewardAmount: e.target.value }))}
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
