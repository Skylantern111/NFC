import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, runTransaction } from 'firebase/firestore';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { CATEGORIES, CATEGORY_ICON } from '../../lib/categories';
import BackButton from '../../components/BackButton';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

// Pull a tagId out of a scanned NDEF message. Provisioned tags are expected
// to carry a URL record pointing at /nfc/:tagId (see lib/tags.js#tagUrl); if
// that shape isn't found, fall back to using the record's raw text.
function tagIdFromNdefMessage(message) {
  const decoder = new TextDecoder();
  for (const record of message.records) {
    if (record.recordType !== 'url' && record.recordType !== 'text') continue;
    const text = decoder.decode(record.data);
    const match = text.match(/\/nfc\/([A-Za-z0-9_-]{6,})/);
    if (match) return match[1];
    if (text.trim()) return text.trim();
  }
  return null;
}

// Reached at /dashboard/items/claim, either after an owner taps an unclaimed
// tag while signed in (?tagId=... link) or via manual entry / an in-app Web
// NFC scan on browsers that support it.
export default function ClaimTag() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [tagId, setTagId] = useState(params.get('tagId') || '');
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('Luggage');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nfcStatus, setNfcStatus] = useState('idle'); // idle | scanning | error | unreadable

  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

  async function scanNfc() {
    setError('');
    setNfcStatus('scanning');
    try {
      const reader = new window.NDEFReader();
      // Handlers must be registered BEFORE scan() is awaited, not after —
      // scan()'s promise resolves once scanning has started, not once a tag
      // has been read, so a tag already resting on the phone (or tapped in
      // the gap between that resolution and a later handler assignment)
      // could fire `reading` before anything is listening (see
      // IMPROVEMENT_PLAN.md Round 4 #5 / the Web NFC spec's own examples).
      reader.onreading = (event) => {
        const scanned = tagIdFromNdefMessage(event.message);
        if (scanned) {
          setTagId(scanned);
          setNfcStatus('idle');
        } else {
          // A tag was detected but its payload didn't match the expected
          // /nfc/:tagId URL shape or a raw text id — distinct from never
          // detecting a tag at all (onreadingerror below).
          setNfcStatus('unreadable');
        }
      };
      reader.onreadingerror = () => setNfcStatus('error');
      await reader.scan();
    } catch {
      setNfcStatus('error');
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (!tagId.trim()) {
      setError('Enter or scan a tag id first.');
      return;
    }

    if (!firebaseReady) {
      // Preview mode: no Firestore to write to.
      nav('/dashboard/items');
      return;
    }

    if (!user) {
      setError('You must be signed in to claim a tag.');
      return;
    }

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const tagRef = doc(db, 'tags', tagId);
        const ownerRef = doc(db, 'itemOwners', tagId);
        const itemRef = doc(db, 'items', tagId);

        const tagSnap = await tx.get(tagRef);
        if (!tagSnap.exists()) {
          throw new Error('Tag not found. Check the id or that this tag has been provisioned.');
        }
        if (tagSnap.data().status === 'blacklisted') {
          throw new Error('This tag has been blacklisted and cannot be claimed.');
        }

        const ownerSnap = await tx.get(ownerRef);
        if (ownerSnap.exists()) {
          throw new Error('This tag has already been claimed.');
        }

        // itemOwners is the private tag→owner map; items is the public-safe
        // record. Rules only allow the exact field set below on items — no
        // `category` (see the file header note in this repo's plan doc).
        tx.set(ownerRef, { ownerUid: user.uid });
        tx.set(itemRef, {
          tagId,
          itemName,
          category,
          isLostMode: false,
          lostMessage: '',
          rewardAmount: 0,
        });
        // Flip provisioning status so admin/Inventory.jsx's claimed count and
        // filter reflect reality (see firestore.rules tags#update for the
        // matching claim-path allowance).
        tx.update(tagRef, { status: 'claimed' });
      });
      nav('/dashboard/items');
    } catch (err) {
      setError(err.message || 'Could not claim this tag.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <BackButton fallback="/dashboard/items" className="mb-3" />
      <h1 className="mb-4 text-2xl font-extrabold text-slate-800 dark:text-slate-100">Claim this tag</h1>
      <Card className="rounded-3xl bg-white/70 dark:bg-white/5 p-6 backdrop-blur-xl shadow-lg">
        <CardContent className="p-0">
          {/* Whole form, including the tag-id field — it previously sat
              outside <form>, so `required` was inert and Enter-to-submit
              did nothing while focused there (see IMPROVEMENT_PLAN.md
              Round 10 #8 / Round 11 #5). */}
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tagId">Tag id</Label>
              <Input
                id="tagId"
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                placeholder="Scanned or shared with you as a link"
                className="font-mono text-xs"
                required
              />
            </div>

            {nfcSupported ? (
              <Button type="button" variant="outline" onClick={scanNfc} disabled={nfcStatus === 'scanning'}>
                {nfcStatus === 'scanning' ? 'Hold your tag to the back of your device…' : 'Scan NFC tag'}
              </Button>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This browser doesn't support NFC scanning — paste the tag id above, or open the link
                from the tag directly.
              </p>
            )}
            {nfcStatus === 'error' && (
              <p className="text-xs text-red-500">
                No tag detected. Make sure NFC is on and try holding the tag against the back of
                your phone again, or enter the tag id manually.
              </p>
            )}
            {nfcStatus === 'unreadable' && (
              <p className="text-xs text-red-500">
                Read a tag, but couldn't find a tag id on it — it may not be a TagBack tag. Enter
                the tag id manually instead.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemName">Item name</Label>
              <Input
                id="itemName"
                placeholder="Black Travel Backpack"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => {
                    const Icon = CATEGORY_ICON[c];
                    return (
                      <SelectItem key={c} value={c}>
                        <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        {c}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button type="submit" disabled={busy}>
              {busy ? 'Claiming…' : 'Claim tag'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
