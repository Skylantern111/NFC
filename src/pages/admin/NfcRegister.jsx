import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  deleteField,
  writeBatch,
} from 'firebase/firestore';
import { db, auth, firebaseReady } from '../../firebase/config';
import {
  generateTagbackId,
  normalizePhysicalUid,
  tagIdFromNdefMessage,
  tagUrl,
} from '../../lib/tags';
import { Button } from '@/components/ui/button';
import NfcScanPanel from '@/components/NfcScanPanel';
import PageHeader from '@/components/PageHeader';
import { LoadingState } from '@/components/States';
import { friendlyFirestoreError } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Nfc,
  Loader2,
  Check,
  Copy,
  TriangleAlert,
  ShieldAlert,
  RotateCcw,
  PencilLine,
} from 'lucide-react';

const CHIP_TYPES = ['NTAG213', 'NTAG215', 'NTAG216'];

// The sticker only ever carries the TagBack URL ({origin}/nfc/{tagId}),
// written once. What a tap actually shows — lost & found page, profile
// card, or a redirect to any URL — lives in tagProfiles/{tagId} and is
// edited from admin/TagContent.jsx (or the owner's dashboard/NfcSetup.jsx),
// so it can change at any time without touching the sticker again
// (NFC_WRITE_DATA_ADMIN_PLAN.md). The old "bypasses TagBack" write options
// that froze a raw URL onto the chip are gone for that reason.

const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

// idle -> scanning -> preview (unregistered) | existing (already registered) -> registering -> registered -> writing -> written | write_failed
export default function NfcRegister() {
  const [params] = useSearchParams();
  // MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md §1.1/§1.2 — jumping in from
  // admin/Inventory.jsx for an existing tag, instead of registering a new
  // TagBack ID. `rewrite` skips straight to the write step for a tag that's
  // already registered (no new tap needed — e.g. retrying a write_failed
  // tag). `reregister` still requires a fresh tap (a replacement sticker's
  // physicalUid needs reading), but on confirm UPDATES that existing TagBack
  // ID's tag doc instead of minting a new one.
  const rewriteTagId = params.get('rewrite') || '';
  const reregisterTagId = params.get('reregister') || '';

  const [phase, setPhase] = useState('idle');
  const [loadingExisting, setLoadingExisting] = useState(!!rewriteTagId);
  const [scanError, setScanError] = useState('');
  // UI_UX_IMPROVEMENT_PLAN.md ADM6: why the last scan failed, for the shared
  // scan panel — 'error' | 'denied' | 'timeout' | null.
  const [scanFailure, setScanFailure] = useState(null);
  const [reading, setReading] = useState(null); // { physicalUid, nfcCapability, matchedTagId }
  const [existingTag, setExistingTag] = useState(null);
  const [chipType, setChipType] = useState('NTAG215');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [tag, setTag] = useState(null); // the registered tags/{tagId} record, once created

  const [writeStatus, setWriteStatus] = useState('not_written');
  const [writeError, setWriteError] = useState('');
  const [copied, setCopied] = useState(false);

  // SYSTEM_AUDIT_PLAN.md B3: an NDEFReader keeps scanning until aborted.
  // Without this, the tap that WRITES the sticker also fired the old scan's
  // onreading, which found the just-registered tag and flipped the page to
  // "already registered" mid-write; Cancel didn't stop the scan either.
  const scanAbortRef = useRef(null);
  function stopScan() {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
  }
  useEffect(() => stopScan, []);


  // Jump straight to the write step for an already-registered tag — no new
  // tap, no new TagBack ID. §1.2's "retry write" action lands here.
  useEffect(() => {
    if (!rewriteTagId || !firebaseReady) {
      setLoadingExisting(false);
      return;
    }
    let live = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'tags', rewriteTagId));
        if (!live) return;
        if (!snap.exists()) {
          setRegisterError(`Tag ${rewriteTagId} not found.`);
        } else {
          const data = snap.data();
          setTag(data);
          setWriteStatus(data.writeStatus || 'not_written');
          setWriteError(data.lastWriteError || '');
          setPhase('registered');
        }
      } finally {
        if (live) setLoadingExisting(false);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewriteTagId]);

  function reset() {
    stopScan();
    setPhase('idle');
    setScanError('');
    setReading(null);
    setExistingTag(null);
    setChipType('NTAG215');
    setRegisterError('');
    setTag(null);
    setWriteStatus('not_written');
    setWriteError('');
    setCopied(false);
  }

  // Looks up whether this tap corresponds to an already-registered asset,
  // either by a matching NDEF /nfc/:tagId already written to the tag, or by
  // a matching physicalUid on file from a prior registration (covers a tag
  // whose NDEF was since erased/rewritten outside TagBack).
  async function findExistingRegistration(ndefTagId, physicalUid) {
    if (ndefTagId) {
      const snap = await getDoc(doc(db, 'tags', ndefTagId));
      if (snap.exists()) return snap.data();
    }
    if (physicalUid) {
      const snap = await getDocs(
        query(collection(db, 'tags'), where('physicalUid', '==', physicalUid), limit(1))
      );
      if (!snap.empty) return snap.docs[0].data();
    }
    return null;
  }

  const onScanTimeout = useCallback(() => {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    setPhase('idle');
    setScanFailure('timeout');
  }, []);

  async function startScan() {
    setScanError('');
    setScanFailure(null);
    setPhase('scanning');
    stopScan();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    try {
      const reader = new window.NDEFReader();
      // Handlers registered before scan() resolves — see ClaimTag.jsx's
      // identical note on why this ordering matters for Web NFC.
      reader.onreading = async (event) => {
        // One tap per scan: stop listening before anything else.
        if (controller.signal.aborted) return;
        stopScan();
        const physicalUid = normalizePhysicalUid(event.serialNumber);
        const ndefTagId = tagIdFromNdefMessage(event.message);
        const nfcCapability = physicalUid ? 'uid-and-ndef' : 'ndef-only';
        try {
          const existing = await findExistingRegistration(ndefTagId, physicalUid);
          if (existing) {
            setExistingTag(existing);
            setPhase('existing');
          } else {
            setReading({ physicalUid, nfcCapability });
            setPhase('preview');
          }
        } catch (err) {
          setScanError(friendlyFirestoreError(err, 'Could not check whether this sticker is registered. Try again.'));
          setPhase('idle');
        }
      };
      reader.onreadingerror = () => {
        stopScan();
        setScanFailure('error');
        setPhase('idle');
      };
      await reader.scan({ signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setScanFailure(err.name === 'NotAllowedError' ? 'denied' : 'error');
      setPhase('idle');
    }
  }

  async function onRegister() {
    if (!reading) return;
    setRegistering(true);
    setRegisterError('');
    try {
      if (reregisterTagId) {
        // §1.1 re-register: re-point an EXISTING TagBack ID at a new
        // physical tap (lost/damaged/swapped sticker) instead of minting a
        // new id — keeps items/itemOwners/tagProfiles intact. status is
        // deliberately left untouched (still 'claimed'); writeStatus resets
        // since the old written-to sticker is no longer the one in hand.
        const patch = {
          physicalUid: reading.physicalUid || null,
          chipType,
          nfcCapabilityAtRegistration: reading.nfcCapability,
          registeredAt: serverTimestamp(),
          writeStatus: 'not_written',
          lastWrittenAt: null,
          lastWriteError: null,
        };
        // Admin-only fields live in tagAdmin (SYSTEM_AUDIT_PLAN.md A7) —
        // and the legacy public copy is removed while we're here.
        const batch = writeBatch(db);
        batch.update(doc(db, 'tags', reregisterTagId), { ...patch, registeredBy: deleteField() });
        batch.set(
          doc(db, 'tagAdmin', reregisterTagId),
          { registeredBy: auth.currentUser?.uid || null, registeredAt: serverTimestamp() },
          { merge: true }
        );
        await batch.commit();
        setTag({ tagId: reregisterTagId, ...patch });
        setPhase('registered');
      } else {
        const tagId = generateTagbackId();
        const record = {
          tagId,
          physicalUid: reading.physicalUid || null,
          chipType,
          nfcCapabilityAtRegistration: reading.nfcCapability,
          status: 'registered',
          registeredAt: serverTimestamp(),
          writeStatus: 'not_written',
        };
        // Astronomically unlikely to collide, but the transaction is what
        // makes a same-instant double-registration safe rather than the
        // best-effort NDEF/UID lookup above.
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'tags', tagId);
          const snap = await tx.get(ref);
          if (snap.exists()) throw new Error('Tag id collision — please try registering again.');
          tx.set(ref, record);
          tx.set(doc(db, 'tagAdmin', tagId), {
            registeredBy: auth.currentUser?.uid || null,
            registeredAt: serverTimestamp(),
          });
        });
        setTag(record);
        setPhase('registered');
      }
    } catch (err) {
      setRegisterError(err?.code ? friendlyFirestoreError(err, 'Could not register the tag. Try again.') : err.message);
    } finally {
      setRegistering(false);
    }
  }

  async function onWriteTag() {
    if (!tag) return;
    const url = tagUrl(tag.tagId);
    stopScan();
    setWriteStatus('writing');
    setWriteError('');
    try {
      const ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: 'url', data: url }] });
      // No verifying read-back — writeStatus reflects the write() Promise
      // outcome only, per NFC_REARCHITECTURE_PLAN.md §13 resolution.
      setWriteStatus('written');
      await updateDoc(doc(db, 'tags', tag.tagId), {
        writeStatus: 'written',
        lastWrittenAt: serverTimestamp(),
        lastWriteError: null,
      });
    } catch (err) {
      const message = err.message || 'The NFC tag could not be written.';
      setWriteStatus('write_failed');
      setWriteError(message);
      await updateDoc(doc(db, 'tags', tag.tagId), {
        writeStatus: 'write_failed',
        lastWriteError: message,
      }).catch(() => {});
    }
  }

  async function onCopyUrl() {
    if (!tag) return;
    try {
      await navigator.clipboard.writeText(tagUrl(tag.tagId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions/insecure context) — ignore silently.
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={reregisterTagId ? 'Re-register a sticker' : rewriteTagId ? 'Retry NFC write' : 'Register tags'}
        description={
          reregisterTagId ? (
            <>Tap the replacement sticker to re-point <span className="font-mono">{reregisterTagId}</span> at it.</>
          ) : rewriteTagId ? (
            <>Re-write the TagBack link for <span className="font-mono">{rewriteTagId}</span> — no new tap needed.</>
          ) : (
            'Tap a blank sticker to read it, register it, and write its TagBack link. Owners claim it later with its TagBack ID.'
          )
        }
        documentTitle="Register tags"
        tourId="nfc-register-header"
      />

      {loadingExisting && <LoadingState label="Loading tag…" />}

      {!loadingExisting && (
      <Card data-tour="nfc-register" className="rounded-lg border-2 border-foreground bg-card shadow-card">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {phase === 'idle' && (
            <>
              {nfcSupported ? (
                <div className="w-full">
                  <NfcScanPanel
                    status={scanFailure || 'idle'}
                    onStart={startScan}
                    idleTitle={reregisterTagId ? 'Tap the new sticker' : 'Tap a sticker to register it'}
                    idleHint="Hold the sticker against the back of this phone after you start."
                    startLabel="Start NFC scan"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="h-5 w-5 text-foreground" />
                  <p>
                    NFC reading is not supported in this browser. Please use Android + Chrome over
                    HTTPS to register physical stickers.
                  </p>
                </div>
              )}
              {scanError && (
                <p role="alert" className="text-sm text-foreground">
                  {scanError}
                </p>
              )}
            </>
          )}

          {phase === 'scanning' && (
            <div className="w-full">
              <NfcScanPanel
                status="scanning"
                onCancel={() => {
                  stopScan();
                  setPhase('idle');
                }}
                onTimeout={onScanTimeout}
              />
            </div>
          )}

          {phase === 'existing' && existingTag && (
            <>
              <ShieldAlert className="h-10 w-10 text-foreground" />
              <p className="font-semibold text-foreground">
                This NFC tag is already registered.
              </p>
              <div className="w-full space-y-1 rounded-md bg-base p-4 text-left text-sm border-2 border-foreground">
                <p><span className="text-muted-foreground">Tag ID:</span> <span className="font-mono">{existingTag.tagId}</span></p>
                <p><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{existingTag.status}</Badge></p>
                <p><span className="text-muted-foreground">Write status:</span> {existingTag.writeStatus || 'not_written'}</p>
              </div>
              <Button variant="outline" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Scan another tag
              </Button>
            </>
          )}

          {phase === 'preview' && reading && (
            <>
              <Check className="h-10 w-10 text-foreground" />
              <p className="font-semibold text-foreground">Tag read successfully</p>
              <div className="w-full space-y-1 rounded-md bg-base p-4 text-left text-sm border-2 border-foreground">
                <p>
                  <span className="text-muted-foreground">Physical UID:</span>{' '}
                  <span className="font-mono">{reading.physicalUid || 'not exposed by this browser/tag'}</span>
                </p>
                <p><span className="text-muted-foreground">NFC capability:</span> {reading.nfcCapability}</p>
                <p><span className="text-muted-foreground">Status:</span> Unregistered</p>
              </div>
              <div className="w-full space-y-2 text-left">
                <Label>Chip type</Label>
                <RadioGroup value={chipType} onValueChange={setChipType} className="flex gap-4">
                  {CHIP_TYPES.map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-sm">
                      <RadioGroupItem value={c} /> {c}
                    </label>
                  ))}
                </RadioGroup>
              </div>
              {registerError && <p className="text-sm text-foreground">{registerError}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={registering}>Cancel</Button>
                <Button onClick={onRegister} loading={registering} className="gap-2">
                  {registering ? 'Registering…' : 'Register tag'}
                </Button>
              </div>
            </>
          )}

          {(phase === 'registered') && tag && (
            <div className="w-full space-y-4 text-left">
              <div className="flex flex-col items-center gap-2 text-center">
                <Check className="h-10 w-10 text-foreground" />
                <p className="font-semibold text-foreground">
                  Registered as <span className="font-mono">{tag.tagId}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Written to the sticker</Label>
                <div className="rounded-md bg-base p-3 font-mono text-xs text-muted-foreground border-2 border-foreground">
                  {tagUrl(tag.tagId)}
                </div>
                <p className="text-xs text-muted-foreground">
                  The sticker only holds this link. What a tap shows (lost &amp; found page, profile
                  card, or a redirect) is set in the tag's content and can change any time without
                  rewriting the sticker.
                </p>
              </div>

              {writeStatus === 'written' && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Check className="h-4 w-4" /> Successfully written.
                </p>
              )}
              {writeStatus === 'write_failed' && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <TriangleAlert className="h-4 w-4" /> {writeError}
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={onCopyUrl} className="gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy TagBack URL'}
                </Button>
                {nfcSupported && (
                  <Button onClick={onWriteTag} disabled={writeStatus === 'writing'} className="gap-1.5">
                    {writeStatus === 'writing' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Nfc className="h-3.5 w-3.5" />
                    )}
                    {writeStatus === 'writing' ? 'Hold tag near phone…' : 'Write NFC tag'}
                  </Button>
                )}
                <Button variant="outline" asChild className="gap-1.5">
                  <Link to={`/admin/tags/${encodeURIComponent(tag.tagId)}`}>
                    <PencilLine className="h-3.5 w-3.5" /> Set tag content
                  </Link>
                </Button>
                {reregisterTagId || rewriteTagId ? (
                  <Button variant="outline" asChild className="gap-1.5">
                    <Link to="/admin/inventory">
                      <Check className="h-3.5 w-3.5" /> Back to inventory
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={reset} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Register another
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {!loadingExisting && !nfcSupported && !rewriteTagId && !reregisterTagId && (
        <p className="text-sm text-muted-foreground">
          Testing without NFC hardware? Create a test tag in{' '}
          <Link to="/admin/settings" className="font-medium text-primary underline">
            Settings › Developer tools
          </Link>
          .
        </p>
      )}

      {!firebaseReady && (
        <p className="text-xs text-foreground">
          Preview mode — no Firestore configured, registration will not persist.
        </p>
      )}
    </div>
  );
}
