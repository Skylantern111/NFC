import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, ExternalLink, PencilLine, ShieldCheck, UserCog } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseReady, db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { useOwnerTagIds, getTagProfile, saveTagProfile, getPublicItem } from '../../lib/ownerItems';
import { EMPTY_PROFILE, formToProfile, profileToForm, validateProfile } from '../../lib/tagContent';
import { friendlyFirestoreError } from '../../lib/utils';
import { TagContentForm } from '../../components/TagContent';
import { Button } from '../../components/ui/button';
import GlassCard from '../../components/GlassCard';
import PageHeader from '../../components/PageHeader';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../components/States';

// My NFC Profile — reached at /dashboard/nfc-setup?tagId=... (linked from
// Items.jsx). The physical-tag identity (tagId/physicalUid/chipType) is
// admin-registered and rendered read-only here; only tagProfiles/{tagId}
// (landing mode, display name, links, toggles) is owner-editable
// (NFC_REARCHITECTURE_PLAN.md §6/§8, NFC_WRITE_DATA_ADMIN_PLAN.md). The
// form is shared with admin/TagContent.jsx. Writing NDEF content is an
// admin-only operation (admin/NfcRegister.jsx) — this page never writes to
// hardware.
export default function NfcSetup() {
  const [params] = useSearchParams();
  const tagId = params.get('tagId') || '';
  const { user } = useAuth();
  const { tagIds, loaded: tagIdsLoaded } = useOwnerTagIds(user);

  const [tag, setTag] = useState(null);
  const [itemName, setItemName] = useState('');
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  // Who saved the profile last. The notice shows only when that save was
  // an admin's: editorRole 'admin' is rules-checked (only a real admin can
  // write it), unlike "some other uid" (UI_UX_IMPROVEMENT_ROUND2.md B6).
  const [lastEditedBy, setLastEditedBy] = useState(null);
  const [lastEditorRole, setLastEditorRole] = useState(null);
  // What was last loaded or saved — the form is "dirty" when it differs.
  const [savedProfile, setSavedProfile] = useState(EMPTY_PROFILE);
  const dirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  // OWN2: warn before a reload/close throws away unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const owned = !tagId || tagIds.includes(tagId);

  useEffect(() => {
    if (!tagId) {
      setLoading(false);
      return;
    }
    let live = true;
    (async () => {
      setLoading(true);
      try {
        if (!firebaseReady) {
          if (live) {
            setTag({ tagId, physicalUid: null, chipType: 'NTAG215', status: 'claimed' });
            setItemName('Preview item');
            setLoading(false);
          }
          return;
        }
        const [tagSnap, item, savedProfile] = await Promise.all([
          getDoc(doc(db, 'tags', tagId)),
          getPublicItem(tagId),
          getTagProfile(tagId),
        ]);
        if (!live) return;
        setTag(tagSnap.exists() ? tagSnap.data() : null);
        setItemName(item?.itemName || '');
        const form = profileToForm(savedProfile);
        setProfile(form);
        setSavedProfile(form);
        setLastEditedBy(savedProfile?.updatedBy || null);
        setLastEditorRole(savedProfile?.editorRole || null);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [tagId]);

  async function onSave(e) {
    e.preventDefault();
    const nextErrors = validateProfile(profile);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      await saveTagProfile(tagId, formToProfile(profile));
      setLastEditedBy(user?.uid || null);
      setLastEditorRole('owner');
      setSavedProfile(profile);
      toast.success('Saved. The next tap shows your changes.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not save profile. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  const tapUrl = `${window.location.origin}/nfc/${tagId}`;
  async function copyTapLink() {
    try {
      await navigator.clipboard.writeText(tapUrl);
      toast.success('Tap link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it instead.');
    }
  }

  if (!tagId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Tap page" backTo="/dashboard/items" backLabel="My Items" />
        <EmptyState
          icon={PencilLine}
          title="Choose an item first"
          description="Open the ⋯ menu on an item in My Items and pick “Edit tap page”."
          action={
            <Button asChild variant="primary">
              <Link to="/dashboard/items">Go to My Items</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (loading || (firebaseReady && !tagIdsLoaded)) {
    return <LoadingState label="Loading tap page…" />;
  }

  if (!owned || !tag) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Tap page" backTo="/dashboard/items" backLabel="My Items" />
        <ErrorState
          title="This tag isn't one of your items"
          description="You can only edit the tap page of a tag you've claimed."
          action={
            <Button asChild variant="secondary">
              <Link to="/dashboard/items">Back to My Items</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-20 md:pb-0">
      <PageHeader
        title="Tap page"
        documentTitle={itemName ? `Tap page · ${itemName}` : 'Tap page'}
        description={`What people see when they tap the sticker on ${itemName || 'this item'}.`}
        backTo="/dashboard/items"
        backLabel="My Items"
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/nfc/${tag.tagId}?preview=1`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Preview
            </Link>
          </Button>
        }
      />

      {/* UI_UX_IMPROVEMENT_PLAN.md GUIDE1: the sticker was written once by
          the admin and always points here — owners never rewrite it. */}
      <GlassCard className="space-y-3">
        <InlineAlert tone="info" title="Your sticker already points here">
          Changes you save show on the next tap. You don't need to rewrite the sticker.
        </InlineAlert>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">Tap link</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-base px-3 py-2.5 text-xs text-foreground shadow-neu-pressed-sm">
              {tapUrl}
            </code>
            <Button type="button" variant="outline" size="icon" onClick={copyTapLink} aria-label="Copy tap link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* OWN1: hardware details are for troubleshooting, not the first thing
            an owner sees. */}
        <details className="text-sm text-muted-foreground">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Technical details</summary>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 pb-1 text-xs">
            <dt>TagBack ID</dt>
            <dd className="font-mono">{tag.tagId}</dd>
            <dt>Physical UID</dt>
            <dd className="font-mono">{tag.physicalUid || 'not exposed by the registering device'}</dd>
            <dt>Chip</dt>
            <dd>{tag.chipType || '—'}</dd>
          </dl>
        </details>
      </GlassCard>

      <form onSubmit={onSave}>
        <GlassCard className="space-y-5">
          {lastEditorRole === 'admin' && user && lastEditedBy !== user.uid && (
            <InlineAlert tone="warning" icon={UserCog}>
              Last edited by a TagBack admin. Your next save replaces their changes.
            </InlineAlert>
          )}

          <TagContentForm profile={profile} setProfile={setProfile} errors={errors} setErrors={setErrors} />

          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
            Only these fields and your lost message are ever shown publicly. Your email, phone and account details
            never are.
          </p>

          <div className="hidden justify-end md:flex">
            <Button type="submit" variant="primary" loading={saving} disabled={!dirty && !saving}>
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>
        </GlassCard>

        {/* OWN2: on phones the save button stays in reach while there are
            unsaved changes (above the bottom tab bar). */}
        {dirty && (
          <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 border-t border-white/60 bg-base/95 px-4 py-2 md:hidden">
            <span className="text-sm text-foreground">Unsaved changes</span>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
