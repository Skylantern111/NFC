import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Loader2, ShieldCheck, TriangleAlert, UserCog } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseReady, db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { useOwnerTagIds, getTagProfile, saveTagProfile, getPublicItem } from '../../lib/ownerItems';
import { EMPTY_PROFILE, formToProfile, profileToForm, validateProfile } from '../../lib/tagContent';
import { friendlyFirestoreError } from '../../lib/utils';
import { TagContentForm } from '../../components/TagContent';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

const glass = 'bg-white/70 dark:bg-white/5 backdrop-blur-xl rounded-3xl';

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
  // uid of whoever saved the profile last — an admin edit shows a notice.
  const [lastEditedBy, setLastEditedBy] = useState(null);

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
        setProfile(profileToForm(savedProfile));
        setLastEditedBy(savedProfile?.updatedBy || null);
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
      toast.success('NFC profile saved.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not save profile. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  if (!tagId) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">My NFC Profile</h1>
        <Card className={glass}>
          <CardContent className="flex flex-col items-center gap-3 p-8">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Open an item from My Items to edit its NFC profile.
            </p>
            <Button asChild>
              <Link to="/dashboard/items">Go to My Items</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || (firebaseReady && !tagIdsLoaded)) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!owned || !tag) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <Card className={glass}>
          <CardContent className="flex flex-col items-center gap-2 p-8">
            <TriangleAlert className="h-5 w-5 text-amber-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This tag isn't one of your claimed items.
            </p>
            <Button asChild variant="outline">
              <Link to="/dashboard/items">Back to My Items</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">My NFC Profile</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose what people see when they tap this tag. Changes apply on the next tap — the sticker never needs rewriting.
        </p>
      </div>

      <Card className={glass}>
        <CardContent className="space-y-1 p-6">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Registered by admin (read-only)</p>
          <p className="text-sm text-slate-800 dark:text-slate-100">Item: {itemName || '—'}</p>
          <p className="font-mono text-xs text-slate-600 dark:text-slate-300">TagBack ID: {tag.tagId}</p>
          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
            Physical UID: {tag.physicalUid || 'not exposed by registering device'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Chip type: {tag.chipType || '—'}</p>
          <div className="pt-2">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to={`/nfc/${tag.tagId}?preview=1`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Preview tap page
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onSave}>
        <Card className={glass}>
          <CardContent className="space-y-5 p-6">
            {lastEditedBy && user && lastEditedBy !== user.uid && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                <UserCog className="h-4 w-4 shrink-0" />
                Last edited by a TagBack admin. Your next save replaces their changes.
              </div>
            )}

            <TagContentForm profile={profile} setProfile={setProfile} errors={errors} setErrors={setErrors} />

            <div className="flex items-center gap-2 rounded-xl bg-base px-3.5 py-2.5 text-xs text-slate-600 dark:text-slate-300 shadow-neu-pressed-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              Only these fields and your item's lost-mode message are ever shown publicly. Your
              email, phone, and account details are never exposed.
            </div>

            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
