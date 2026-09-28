import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { doc, runTransaction } from 'firebase/firestore';
import { MailCheck, Smartphone } from 'lucide-react';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { CATEGORIES, CATEGORY_ICON } from '../../lib/categories';
import { normalizePhysicalUid, normalizeTagbackId, tagIdFromNdefMessage } from '../../lib/tags';
import { isAdminManaged } from '../../lib/tagContent';
import { friendlyFirestoreError } from '../../lib/utils';
import GlassCard from '../../components/GlassCard';
import PageHeader from '../../components/PageHeader';
import FormField, { FormError } from '../../components/FormField';
import NfcScanPanel from '../../components/NfcScanPanel';
import { EmptyState, InlineAlert } from '../../components/States';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

const TAGBACK_ID = /^TB-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Reached at /dashboard/items/claim, either after an owner taps an unclaimed
// tag while signed in (?tagId=... link) or via manual entry / an in-app Web
// NFC scan on browsers that support it.
//
// UI_UX_IMPROVEMENT_PLAN.md NFC1–NFC7: two clear paths (tap or type), a
// scan panel with Cancel and a 30 s timeout, a visible "Tag detected"
// state, and errors next to the field they belong to. The reader and the
// claim transaction below are unchanged.
export default function ClaimTag() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [tagId, setTagId] = useState(params.get('tagId') || '');
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({}); // { tagId?, itemName?, category?, form? }
  // idle | scanning | detected | error | unreadable | denied | timeout
  const [nfcStatus, setNfcStatus] = useState('idle');
  // Optional cross-check (MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md §2.1): if this
  // scan's tap also exposed a hardware serial, compare it against the
  // registered physicalUid after claiming — catches a mislabeled/swapped
  // sticker. Never blocks the claim; NDEF content stays the primary
  // tap-to-claim mechanism per NFC_REARCHITECTURE_PLAN.md §4.4.
  const [scannedUid, setScannedUid] = useState(null);
  const itemNameRef = useRef(null);

  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

  // SYSTEM_AUDIT_PLAN.md B3: stop the reader after one tap (and on unmount)
  // instead of leaving it scanning for the rest of the page's life.
  const scanAbortRef = useRef(null);
  function stopScan() {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
  }
  useEffect(() => stopScan, []);

  async function scanNfc() {
    setErrors({});
    setNfcStatus('scanning');
    stopScan();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    try {
      const reader = new window.NDEFReader();
      // Handlers must be registered BEFORE scan() is awaited, not after —
      // scan()'s promise resolves once scanning has started, not once a tag
      // has been read (IMPROVEMENT_PLAN.md Round 4 #5).
      reader.onreading = (event) => {
        if (controller.signal.aborted) return;
        stopScan();
        const scanned = tagIdFromNdefMessage(event.message);
        setScannedUid(normalizePhysicalUid(event.serialNumber));
        if (scanned) {
          setTagId(scanned);
          setNfcStatus('detected');
          // Next step: name the item.
          setTimeout(() => itemNameRef.current?.focus(), 0);
        } else {
          // A tag was read, but it doesn't carry a TagBack /nfc/:tagId URL.
          setNfcStatus('unreadable');
        }
      };
      reader.onreadingerror = () => {
        stopScan();
        setNfcStatus('error');
      };
      await reader.scan({ signal: controller.signal });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setNfcStatus(err?.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }

  function cancelScan() {
    stopScan();
    setNfcStatus('idle');
  }
  const onScanTimeout = useCallback(() => {
    stopScan();
    setNfcStatus('timeout');
  }, []);

  function validate(normalizedTagId) {
    const next = {};
    if (!tagId.trim()) next.tagId = 'Enter the TagBack ID, or scan the tag.';
    // A malformed id (e.g. a pasted URL) would otherwise reach doc() and
    // throw a cryptic "invalid document reference" (SYSTEM_AUDIT_PLAN.md B2).
    else if (!TAGBACK_ID.test(normalizedTagId)) next.tagId = 'That doesn’t look like a TagBack ID. It looks like TB-ABCD-2345.';
    if (!itemName.trim()) next.itemName = 'Give the item a name, e.g. “Black backpack”.';
    if (!category) next.category = 'Choose a category.';
    return next;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const normalizedTagId = normalizeTagbackId(tagId);
    const nextErrors = validate(normalizedTagId);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }

    if (!firebaseReady) {
      // Preview mode: no Firestore to write to.
      nav('/dashboard/items');
      return;
    }

    if (!user) {
      setErrors({ form: 'You must be signed in to claim a tag.' });
      return;
    }

    let registeredPhysicalUid = null;

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const tagRef = doc(db, 'tags', normalizedTagId);
        const ownerRef = doc(db, 'itemOwners', normalizedTagId);
        const itemRef = doc(db, 'items', normalizedTagId);

        const tagSnap = await tx.get(tagRef);
        if (!tagSnap.exists()) {
          throw new Error('No tag has this ID. Check the TagBack ID printed on the sticker.');
        }
        if (tagSnap.data().status === 'blacklisted') {
          throw new Error('This tag has been blocked by TagBack and cannot be claimed.');
        }
        registeredPhysicalUid = tagSnap.data().physicalUid || null;

        const ownerSnap = await tx.get(ownerRef);
        if (ownerSnap.exists()) {
          throw new Error('This tag already belongs to someone. If it’s yours, ask them to release it first.');
        }

        // Mirrors the claim guard in firestore.rules: a tag an admin set up
        // as a profile/redirect is company-managed, not claimable stock.
        const profileSnap = await tx.get(doc(db, 'tagProfiles', normalizedTagId));
        if (isAdminManaged(profileSnap.exists() ? profileSnap.data() : null)) {
          throw new Error('This tag is managed by TagBack and cannot be claimed. Contact the admin if this seems wrong.');
        }

        // itemOwners is the private tag→owner map; items is the public-safe
        // record.
        tx.set(ownerRef, { ownerUid: user.uid });
        tx.set(itemRef, {
          tagId: normalizedTagId,
          itemName: itemName.trim(),
          category,
          isLostMode: false,
          lostMessage: '',
          rewardAmount: 0,
        });
        // Flip provisioning status so admin/Inventory.jsx's claimed count and
        // filter reflect reality.
        tx.update(tagRef, { status: 'claimed' });
      });
      if (scannedUid && registeredPhysicalUid && scannedUid !== registeredPhysicalUid) {
        toast.warning(
          "This tag's hardware ID doesn't match what the admin registered — the sticker may have been swapped. Contact the admin if this seems wrong."
        );
      }
      toast.success(`${itemName.trim()} is now protected.`);
      nav('/dashboard/items', { state: { claimed: normalizedTagId } });
    } catch (err) {
      // Our own checks above throw plain Errors with a readable message;
      // Firestore errors carry a `code` and get the friendly wording.
      setErrors({ form: err?.code ? friendlyFirestoreError(err, 'Could not claim this tag. Try again.') : err.message });
    } finally {
      setBusy(false);
    }
  }

  // firestore.rules refuses a claim from an unverified email; say so up
  // front instead of letting the form fail at the last step.
  if (firebaseReady && user && !user.emailVerified) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Claim a tag" backTo="/dashboard/items" />
        <EmptyState
          icon={MailCheck}
          title="Verify your email first"
          description="Claiming a tag needs a verified email, so finders' messages reach a real person."
          action={
            <Button asChild variant="primary">
              <Link to="/dashboard/verify-email">Verify my email</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Claim a tag"
        description="Link a TagBack sticker to your account so finders can reach you."
        backTo="/dashboard/items"
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <GlassCard className="space-y-4">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">1. Find your tag</h2>
          {nfcSupported ? (
            <NfcScanPanel
              status={nfcStatus}
              onStart={scanNfc}
              onCancel={cancelScan}
              onTimeout={onScanTimeout}
              detectedDetail={`TagBack ID ${normalizeTagbackId(tagId)} — now name the item below.`}
              fallbackHint="Or type the TagBack ID below."
            />
          ) : (
            <InlineAlert icon={Smartphone} title="Scanning isn’t available in this browser">
              Tap-to-scan works in Chrome on Android. Type the TagBack ID printed on the sticker instead, or tap the
              sticker with your phone to open its link.
            </InlineAlert>
          )}

          <FormField
            id="tagId"
            label={nfcSupported ? 'Or type the TagBack ID' : 'TagBack ID'}
            hint="Printed on the sticker, e.g. TB-ABCD-2345."
            error={errors.tagId}
          >
            <Input
              value={tagId}
              onChange={(e) => {
                setTagId(e.target.value);
                if (nfcStatus === 'detected') setNfcStatus('idle');
              }}
              placeholder="TB-XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase tracking-wide"
            />
          </FormField>
        </GlassCard>

        <GlassCard className="space-y-4">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">2. Describe the item</h2>
          <FormField id="itemName" label="Item name" hint="Finders see this name." error={errors.itemName}>
            <Input
              ref={itemNameRef}
              placeholder="e.g. Black travel backpack"
              value={itemName}
              maxLength={100}
              autoComplete="off"
              autoCapitalize="sentences"
              onChange={(e) => setItemName(e.target.value)}
            />
          </FormField>

          <FormField id="category" label="Category" error={errors.category}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" aria-invalid={errors.category ? true : undefined} className="h-11 w-full rounded-xl">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICON[c];
                  return (
                    <SelectItem key={c} value={c}>
                      <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                      {c}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </FormField>

          <FormError>{errors.form}</FormError>

          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {busy ? 'Claiming…' : 'Claim tag'}
          </Button>
        </GlassCard>
      </form>
    </div>
  );
}
