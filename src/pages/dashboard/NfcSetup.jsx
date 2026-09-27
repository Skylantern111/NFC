import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  MessageCircle,
  ShieldCheck,
  TriangleAlert,
  Youtube,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseReady, db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { useOwnerTagIds, getTagProfile, saveTagProfile, getPublicItem } from '../../lib/ownerItems';
import { friendlyFirestoreError } from '../../lib/utils';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';

const glass = 'bg-white/70 dark:bg-white/5 backdrop-blur-xl rounded-3xl';

const LINK_FIELDS = [
  { key: 'website', label: 'Website', icon: Globe },
  { key: 'instagram', label: 'Instagram', icon: Instagram },
  { key: 'facebook', label: 'Facebook', icon: Facebook },
  { key: 'tiktok', label: 'TikTok', icon: Globe },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { key: 'youtube', label: 'YouTube', icon: Youtube },
];

const EMPTY_PROFILE = {
  website: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  linkedin: '',
  youtube: '',
  contactUrl: '',
  contactEnabled: false,
  lostFoundEnabled: true,
};

function isHttpsUrl(value) {
  return /^https:\/\/.+/.test(value);
}

// My NFC Profile — reached at /dashboard/nfc-setup?tagId=... (linked from
// Items.jsx). The physical-tag identity (tagId/physicalUid/chipType) is
// admin-registered and rendered read-only here; only tagProfiles/{tagId}
// (social links, contact/lost-found toggles) is owner-editable
// (NFC_REARCHITECTURE_PLAN.md §6/§8). Writing NDEF content is an admin-only
// operation (admin/NfcRegister.jsx) — this page never writes to hardware.
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
        setProfile({ ...EMPTY_PROFILE, ...(savedProfile || {}) });
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [tagId]);

  function setLink(key, value) {
    setProfile((p) => ({ ...p, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  // contactUrl shares the same https-only validation/cleaning as the social
  // links above, but is gated by the contactEnabled toggle rather than
  // always shown — kept as a separate list so LINK_FIELDS (the preview row)
  // doesn't need to special-case it.
  const URL_FIELD_KEYS = [...LINK_FIELDS.map((f) => f.key), 'contactUrl'];

  async function onSave(e) {
    e.preventDefault();
    const nextErrors = {};
    for (const key of URL_FIELD_KEYS) {
      const value = profile[key]?.trim();
      if (value && !isHttpsUrl(value)) {
        nextErrors[key] = 'Enter a valid https:// URL, or leave blank.';
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(profile).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
      );
      // Rules whitelist an exact field set — an empty string for an unset
      // link is fine (still passes isHttpsUrl's "absent or https://" check
      // only when the field is actually omitted), so drop blanks entirely
      // rather than writing empty strings that would fail publicProfileFieldsOnly's
      // per-field https:// check.
      for (const key of URL_FIELD_KEYS) {
        if (!cleaned[key]) delete cleaned[key];
      }
      await saveTagProfile(tagId, cleaned);
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
          Configure what a finder sees when they tap this tag.
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
              <Link to={`/nfc/${tag.tagId}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Preview finder page
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onSave}>
        <Card className={glass}>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between rounded-xl bg-base p-3.5 shadow-neu-flat-sm">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Lost &amp; Found</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Show lost status and let finders report/message you.</p>
              </div>
              <Switch
                checked={profile.lostFoundEnabled}
                onCheckedChange={(v) => setProfile((p) => ({ ...p, lostFoundEnabled: v }))}
              />
            </div>

            <div className="rounded-xl bg-base p-3.5 shadow-neu-flat-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contact information</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Show a way to reach you beyond anonymous chat.</p>
                </div>
                <Switch
                  checked={profile.contactEnabled}
                  onCheckedChange={(v) => setProfile((p) => ({ ...p, contactEnabled: v }))}
                />
              </div>
              {profile.contactEnabled && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <Label htmlFor="contactUrl">Contact link</Label>
                  <Input
                    id="contactUrl"
                    placeholder="https://wa.me/1555… or another contact link"
                    value={profile.contactUrl || ''}
                    onChange={(e) => setLink('contactUrl', e.target.value)}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    A link, not a raw phone/email — e.g. a WhatsApp click-to-chat URL. Your real
                    phone/email (Settings) is never shown publicly.
                  </p>
                  {errors.contactUrl && <p className="text-xs text-red-500">{errors.contactUrl}</p>}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {LINK_FIELDS.map(({ key, label, icon: Icon }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    placeholder="https://…"
                    value={profile[key] || ''}
                    onChange={(e) => setLink(key, e.target.value)}
                  />
                  {errors[key] && <p className="text-xs text-red-500">{errors[key]}</p>}
                </div>
              ))}
            </div>

            {/* Live preview, from current form state — matches how these
                pills render on public/NfcLanding.jsx, so an owner sees the
                effect of a link before saving instead of save-then-check
                (MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md §3.1). */}
            {(LINK_FIELDS.some(({ key }) => isHttpsUrl(profile[key]?.trim() || '')) ||
              (profile.contactEnabled && isHttpsUrl(profile.contactUrl?.trim() || ''))) && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Preview — what a finder sees on your tag's page
                </p>
                <div className="flex flex-wrap gap-2">
                  {LINK_FIELDS.filter(({ key }) => isHttpsUrl(profile[key]?.trim() || '')).map(({ key, label, icon: Icon }) => (
                    <span
                      key={key}
                      className="flex items-center gap-1.5 rounded-full bg-base px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-neu-flat-sm"
                    >
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </span>
                  ))}
                  {profile.contactEnabled && isHttpsUrl(profile.contactUrl?.trim() || '') && (
                    <span className="flex items-center gap-1.5 rounded-full bg-base px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-neu-flat-sm">
                      <MessageCircle className="h-3.5 w-3.5" /> Contact
                    </span>
                  )}
                </div>
              </div>
            )}

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
