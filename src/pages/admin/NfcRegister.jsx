import { useEffect, useState } from 'react';
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
} from 'firebase/firestore';
import { db, auth, firebaseReady } from '../../firebase/config';
import {
  generateTagbackId,
  normalizePhysicalUid,
  tagIdFromNdefMessage,
  tagUrl,
} from '../../lib/tags';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';

const CHIP_TYPES = ['NTAG213', 'NTAG215', 'NTAG216'];

// What the admin can choose to write. Only one NDEF URI record fits on the
// tag, so this is an either/or choice, not additive:
//   - 'lostfound' writes the TagBack tap URL — the finder lands on the
//     TagBack public page (report/chat/social-links-from-tagProfiles all
//     live there). This is the only option that provisions a TagBack asset.
//   - every other option writes the admin-typed URL directly and REPLACES
//     the TagBack URL — the sticker no longer opens TagBack at all, it
//     opens that link straight from the phone's OS-level NFC handling.
//     These exist for provisioning a non-TagBack sticker (e.g. a plain
//     company-page tag), NOT for adding a social link to a TagBack tag —
//     that's what tagProfiles/{tagId} (owner's NFC profile page) is for.
const WRITE_OPTIONS = [
  { value: 'lostfound', label: 'TagBack Lost & Found (recommended)', bypasses: false },
  { value: 'website', label: 'Website URL — bypasses TagBack', bypasses: true },
  { value: 'instagram', label: 'Instagram — bypasses TagBack', bypasses: true },
  { value: 'facebook', label: 'Facebook — bypasses TagBack', bypasses: true },
  { value: 'tiktok', label: 'TikTok — bypasses TagBack', bypasses: true },
  { value: 'linkedin', label: 'LinkedIn — bypasses TagBack', bypasses: true },
  { value: 'youtube', label: 'YouTube — bypasses TagBack', bypasses: true },
  { value: 'custom', label: 'Custom URL — bypasses TagBack', bypasses: true },
];

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
  const [reading, setReading] = useState(null); // { physicalUid, nfcCapability, matchedTagId }
  const [existingTag, setExistingTag] = useState(null);
  const [chipType, setChipType] = useState('NTAG215');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [tag, setTag] = useState(null); // the registered tags/{tagId} record, once created

  const [writeOption, setWriteOption] = useState('lostfound');
  const [customUrl, setCustomUrl] = useState('');
  const [writeStatus, setWriteStatus] = useState('not_written');
  const [writeError, setWriteError] = useState('');
  const [copied, setCopied] = useState(false);

  const [devTagId, setDevTagId] = useState('');
  const [devChipType, setDevChipType] = useState('NTAG215');
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState('');

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
    setPhase('idle');
    setScanError('');
    setReading(null);
    setExistingTag(null);
    setChipType('NTAG215');
    setRegisterError('');
    setTag(null);
    setWriteOption('lostfound');
    setCustomUrl('');
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

  async function startScan() {
    setScanError('');
    setPhase('scanning');
    try {
      const reader = new window.NDEFReader();
      // Handlers registered before scan() resolves — see ClaimTag.jsx's
      // identical note on why this ordering matters for Web NFC.
      reader.onreading = async (event) => {
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
          setScanError(err.message || 'Could not check registration status.');
          setPhase('idle');
        }
      };
      reader.onreadingerror = () => {
        setScanError('No NFC tag detected. Hold the phone closer to the sticker and try again.');
        setPhase('idle');
      };
      await reader.scan();
    } catch (err) {
      setScanError(
        err.name === 'NotAllowedError'
          ? 'NFC permission was denied. Please allow NFC access and try again.'
          : err.message || 'Could not start NFC scan.'
      );
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
          registeredBy: auth.currentUser?.uid || null,
          writeStatus: 'not_written',
          lastWrittenAt: null,
          lastWriteError: null,
        };
        await updateDoc(doc(db, 'tags', reregisterTagId), patch);
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
          registeredBy: auth.currentUser?.uid || null,
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
        });
        setTag(record);
        setPhase('registered');
      }
    } catch (err) {
      setRegisterError(err.message || 'Failed to register tag.');
    } finally {
      setRegistering(false);
    }
  }

  function writeUrlFor(tagId) {
    if (writeOption === 'lostfound') return tagUrl(tagId);
    return customUrl.trim();
  }

  async function onWriteTag() {
    if (!tag) return;
    const url = writeUrlFor(tag.tagId);
    if (!url) {
      setWriteError('Enter a URL to write.');
      return;
    }
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

  // Dev-only fallback for testing the rest of the app without NFC hardware
  // (NFC_REARCHITECTURE_PLAN.md §5/§11). physicalUid always stays null here
  // — nothing physical was ever read — and nfcCapabilityAtRegistration is
  // tagged 'dev-fallback' so it's never confused with a real ndef-only read.
  async function onDevRegister() {
    setDevBusy(true);
    setDevError('');
    try {
      const tagId = generateTagbackId();
      const record = {
        tagId,
        physicalUid: null,
        chipType: devChipType,
        nfcCapabilityAtRegistration: 'dev-fallback',
        status: 'registered',
        registeredAt: serverTimestamp(),
        registeredBy: auth.currentUser?.uid || null,
        writeStatus: 'not_written',
      };
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'tags', tagId);
        const snap = await tx.get(ref);
        if (snap.exists()) throw new Error('Tag id collision — please try again.');
        tx.set(ref, record);
      });
      setDevTagId(tagId);
    } catch (err) {
      setDevError(err.message || 'Failed to register tag.');
    } finally {
      setDevBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          {reregisterTagId ? 'Re-register physical sticker' : rewriteTagId ? 'Retry NFC write' : 'NFC tag registration'}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {reregisterTagId ? (
            <>Tap the replacement sticker to re-point <span className="font-mono">{reregisterTagId}</span> at it.</>
          ) : rewriteTagId ? (
            <>Re-write the TagBack URL for <span className="font-mono">{rewriteTagId}</span> — no new tap needed.</>
          ) : (
            "Tap a physical NFC sticker to read it, register it, and write its TagBack URL."
          )}
        </p>
      </div>

      {loadingExisting && (
        <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tag…
          </CardContent>
        </Card>
      )}

      {!loadingExisting && (
      <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {phase === 'idle' && (
            <>
              <Nfc className="h-10 w-10 text-purple-600" />
              {nfcSupported ? (
                <>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {reregisterTagId ? 'Tap the new sticker' : 'Tap NFC sticker to register it'}
                  </p>
                  <Button onClick={startScan} className="gap-2">
                    <Nfc className="h-4 w-4" /> Start NFC scan
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <TriangleAlert className="h-5 w-5 text-amber-500" />
                  <p>
                    NFC reading is not supported in this browser. Please use Android + Chrome over
                    HTTPS to register physical stickers.
                  </p>
                </div>
              )}
              {scanError && <p className="text-sm text-red-500">{scanError}</p>}
            </>
          )}

          {phase === 'scanning' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
              <p className="font-semibold text-slate-800 dark:text-slate-100">Waiting for NFC…</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Hold the sticker against the back of the device.
              </p>
              <Button variant="outline" onClick={() => setPhase('idle')}>
                Cancel
              </Button>
            </>
          )}

          {phase === 'existing' && existingTag && (
            <>
              <ShieldAlert className="h-10 w-10 text-amber-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                This NFC tag is already registered.
              </p>
              <div className="w-full space-y-1 rounded-xl bg-base p-4 text-left text-sm shadow-neu-pressed-sm">
                <p><span className="text-slate-500 dark:text-slate-400">Tag ID:</span> <span className="font-mono">{existingTag.tagId}</span></p>
                <p><span className="text-slate-500 dark:text-slate-400">Status:</span> <Badge variant="outline">{existingTag.status}</Badge></p>
                <p><span className="text-slate-500 dark:text-slate-400">Write status:</span> {existingTag.writeStatus || 'not_written'}</p>
              </div>
              <Button variant="outline" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Scan another tag
              </Button>
            </>
          )}

          {phase === 'preview' && reading && (
            <>
              <Check className="h-10 w-10 text-emerald-600" />
              <p className="font-semibold text-slate-800 dark:text-slate-100">Tag read successfully</p>
              <div className="w-full space-y-1 rounded-xl bg-base p-4 text-left text-sm shadow-neu-pressed-sm">
                <p>
                  <span className="text-slate-500 dark:text-slate-400">Physical UID:</span>{' '}
                  <span className="font-mono">{reading.physicalUid || 'not exposed by this browser/tag'}</span>
                </p>
                <p><span className="text-slate-500 dark:text-slate-400">NFC capability:</span> {reading.nfcCapability}</p>
                <p><span className="text-slate-500 dark:text-slate-400">Status:</span> Unregistered</p>
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
              {registerError && <p className="text-sm text-red-500">{registerError}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button onClick={onRegister} disabled={registering} className="gap-2">
                  {registering && <Loader2 className="h-4 w-4 animate-spin" />}
                  {registering ? 'Registering…' : 'Register tag'}
                </Button>
              </div>
            </>
          )}

          {(phase === 'registered') && tag && (
            <div className="w-full space-y-4 text-left">
              <div className="flex flex-col items-center gap-2 text-center">
                <Check className="h-10 w-10 text-emerald-600" />
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  Registered as <span className="font-mono">{tag.tagId}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>What do you want to write to this tag?</Label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Only one link fits on the tag. TagBack Lost &amp; Found opens the TagBack page
                  (report/chat and the owner's social links live there). Every other option
                  replaces that with a plain link and the sticker stops opening TagBack.
                </p>
                <RadioGroup value={writeOption} onValueChange={setWriteOption} className="gap-2">
                  {WRITE_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 rounded-xl bg-base p-2.5 text-sm shadow-neu-flat-sm">
                      <RadioGroupItem value={o.value} /> {o.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {WRITE_OPTIONS.find((o) => o.value === writeOption)?.bypasses && (
                <p className="flex items-start gap-1.5 rounded-xl bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                  This tag will no longer open the TagBack page — Lost &amp; Found, found-item
                  reports, and anonymous chat won't be reachable from this sticker anymore.
                </p>
              )}

              {writeOption === 'lostfound' ? (
                <div className="rounded-xl bg-base p-3 font-mono text-xs text-slate-600 dark:text-slate-300 shadow-neu-pressed-sm">
                  {tagUrl(tag.tagId)}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="customUrl">URL to write</Label>
                  <Input
                    id="customUrl"
                    placeholder="https://…"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                  />
                </div>
              )}

              {writeStatus === 'written' && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <Check className="h-4 w-4" /> Successfully written.
                </p>
              )}
              {writeStatus === 'write_failed' && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-500">
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
                {reregisterTagId || rewriteTagId ? (
                  <Button variant="outline" asChild className="gap-1.5">
                    <Link to="/admin/inventory">
                      <Check className="h-3.5 w-3.5" /> Done — back to inventory
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
        <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base">Development fallback</CardTitle>
            <CardDescription>
              No physical tag is read here — this only creates a Firestore record for testing the
              claim/inventory flow without NFC hardware. Not a production registration path.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Chip type</Label>
              <RadioGroup value={devChipType} onValueChange={setDevChipType} className="flex gap-3">
                {CHIP_TYPES.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm">
                    <RadioGroupItem value={c} /> {c}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <Button variant="outline" onClick={onDevRegister} disabled={devBusy}>
              {devBusy ? 'Registering…' : 'Register tag (dev fallback)'}
            </Button>
            {devError && <p className="text-sm text-red-500">{devError}</p>}
            {devTagId && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Registered: <span className="font-mono">{devTagId}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!firebaseReady && (
        <p className="text-xs text-amber-600">
          Preview mode — no Firestore configured, registration will not persist.
        </p>
      )}
    </div>
  );
}
