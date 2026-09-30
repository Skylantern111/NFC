import { useState } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase/config';
import { generateTagbackId } from '../lib/tags';
import { friendlyFirestoreError } from '../lib/utils';
import { FormError } from './FormField';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

const CHIP_TYPES = ['NTAG213', 'NTAG215', 'NTAG216'];

// Dev-only fallback for testing the rest of the app without NFC hardware
// (NFC_REARCHITECTURE_PLAN.md §5/§11). physicalUid always stays null here
// — nothing physical was ever read — and nfcCapabilityAtRegistration is
// tagged 'dev-fallback' so it's never confused with a real ndef-only read.
// Lives in admin Settings › Developer tools (moved off NFC Register).
export default function DevTagRegisterCard({ className = '' }) {
  const [chipType, setChipType] = useState('NTAG215');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tagId, setTagId] = useState('');

  async function onRegister() {
    if (!firebaseReady) {
      setError('Preview mode — no Firebase project is configured, so no tag was created.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const newId = generateTagbackId();
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'tags', newId);
        const snap = await tx.get(ref);
        if (snap.exists()) throw new Error('Tag id collision — please try again.');
        tx.set(ref, {
          tagId: newId,
          physicalUid: null,
          chipType,
          nfcCapabilityAtRegistration: 'dev-fallback',
          status: 'registered',
          registeredAt: serverTimestamp(),
          writeStatus: 'not_written',
        });
        tx.set(doc(db, 'tagAdmin', newId), {
          registeredBy: auth.currentUser?.uid || null,
          registeredAt: serverTimestamp(),
        });
      });
      setTagId(newId);
    } catch (err) {
      setError(err?.code ? friendlyFirestoreError(err, 'Could not register the tag. Try again.') : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Test tag without NFC hardware</CardTitle>
        <CardDescription>
          Creates a tag record so you can test claiming and the finder flow. No sticker is read or written. Don&apos;t
          hand these out as real tags.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Chip type</Label>
          <RadioGroup value={chipType} onValueChange={setChipType} className="flex flex-wrap gap-3">
            {CHIP_TYPES.map((c) => (
              <label key={c} className="flex min-h-11 items-center gap-1.5 text-sm">
                <RadioGroupItem value={c} /> {c}
              </label>
            ))}
          </RadioGroup>
        </div>
        <Button variant="outline" onClick={onRegister} loading={busy}>
          {busy ? 'Registering…' : 'Register test tag'}
        </Button>
        <FormError>{error}</FormError>
        {tagId && (
          <p className="text-sm text-muted-foreground">
            Registered: <span className="font-mono">{tagId}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
