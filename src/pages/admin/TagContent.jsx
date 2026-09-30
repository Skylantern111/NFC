import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { ExternalLink, TriangleAlert, Users } from 'lucide-react';
import { db, firebaseReady } from '../../firebase/config';
import {
  applyTagProfileToMany,
  deleteTagProfile,
  getPublicItem,
  getTagProfile,
  getTagScanBreakdown,
  saveTagProfile,
} from '../../lib/ownerItems';
import { EMPTY_PROFILE, formToProfile, profileToForm, validateProfile } from '../../lib/tagContent';
import { TAG_STATUS_BADGE } from '../../lib/tags';
import { friendlyFirestoreError } from '../../lib/utils';
import { TagContentForm } from '../../components/TagContent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const CARD = 'rounded-lg border-2 border-foreground bg-card shadow-card';
const BULK_KEY = 'tagContentBulkSelection';

// Admin editor for what a tap on a sticker shows (NFC_WRITE_DATA_ADMIN_PLAN.md).
// The sticker itself only holds tagUrl(tagId) — this page changes
// tagProfiles/{tagId}, so edits apply on the next tap with no rewrite.
//
//   /admin/tags/:tagId  — one tag (any status except blacklisted)
//   /admin/tags/bulk    — one template onto the unclaimed tags selected in
//                         admin/Inventory.jsx (passed via router state)
export default function TagContent() {
  const { tagId } = useParams();
  const location = useLocation();
  const bulk = tagId === 'bulk';
  // Bulk selection arrives in router state, which a page reload drops —
  // keep a copy in sessionStorage so a refresh doesn't lose it
  // (SYSTEM_AUDIT_ROUND2.md B8).
  const [bulkSelection] = useState(() => {
    if (!bulk) return { tagIds: [], skipped: 0 };
    if (location.state?.tagIds) {
      const sel = { tagIds: location.state.tagIds, skipped: location.state.skipped || 0 };
      try {
        sessionStorage.setItem(BULK_KEY, JSON.stringify(sel));
      } catch {
        // Storage blocked — selection just won't survive a reload.
      }
      return sel;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(BULK_KEY) || 'null');
      if (Array.isArray(saved?.tagIds)) return { tagIds: saved.tagIds, skipped: saved.skipped || 0 };
    } catch {
      // Fall through to an empty selection.
    }
    return { tagIds: [], skipped: 0 };
  });
  const bulkIds = bulkSelection.tagIds;
  const bulkSkipped = bulkSelection.skipped;

  const [tag, setTag] = useState(null);
  const [itemName, setItemName] = useState('');
  const [scanCount, setScanCount] = useState(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(!bulk);
  const [saving, setSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false); // a tagProfiles doc exists for this tag
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (bulk || !firebaseReady) {
      setLoading(false);
      return;
    }
    let live = true;
    (async () => {
      try {
        const [tagSnap, saved, item, count] = await Promise.all([
          getDoc(doc(db, 'tags', tagId)),
          getTagProfile(tagId),
          getPublicItem(tagId),
          getTagScanBreakdown(tagId),
        ]);
        if (!live) return;
        setTag(tagSnap.exists() ? tagSnap.data() : null);
        setProfile(profileToForm(saved));
        setHasSaved(!!saved);
        setItemName(item?.itemName || '');
        setScanCount(count);
      } catch (err) {
        if (live) toast.error(friendlyFirestoreError(err, 'Could not load this tag.'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [bulk, tagId]);

  async function onSave(e) {
    e.preventDefault();
    const nextErrors = validateProfile(profile);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const data = formToProfile(profile);
      if (bulk) {
        await applyTagProfileToMany(bulkIds, data);
        toast.success(`Content applied to ${bulkIds.length} tag${bulkIds.length === 1 ? '' : 's'}.`);
      } else {
        await saveTagProfile(tagId, data, { editorRole: 'admin' });
        setHasSaved(true);
        toast.success('Tag content saved. It applies on the next tap.');
      }
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not save tag content.'));
    } finally {
      setSaving(false);
    }
  }

  // "Reset content" — deletes the profile, so the tag goes back to the
  // default Lost & Found page (and, if unclaimed, becomes claimable again).
  async function onReset() {
    setSaving(true);
    try {
      await deleteTagProfile(tagId);
      setProfile(EMPTY_PROFILE);
      setHasSaved(false);
      setConfirmReset(false);
      toast.success('Content reset to the default Lost & Found page.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not reset tag content.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading tag content…" />;
  }

  const unavailable = bulk ? bulkIds.length === 0 : !tag || tag.status === 'blacklisted';
  if (unavailable) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorState
          title={bulk ? 'No tags selected' : !tag ? 'Tag not found' : 'This tag is blacklisted'}
          description={
            bulk
              ? 'Select Registered rows in Inventory, then choose "Set content".'
              : !tag
                ? `No tag has the ID ${tagId}.`
                : 'Unblacklist it in Inventory before editing its content.'
          }
          action={
            <Button asChild variant="secondary">
              <Link to="/admin/tags">Back to Tag Content</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={bulk ? `Set content for ${bulkIds.length} tag${bulkIds.length === 1 ? '' : 's'}` : `Tag content · ${tagId}`}
        description="The sticker only holds its TagBack link. What a tap shows is set here and applies on the next tap — no rewrite needed."
        backTo="/admin/tags"
        backLabel="Tag Content"
      />

      <Card className={CARD}>
        <CardContent className="space-y-2 p-6 text-sm">
          {bulk ? (
            <>
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <Users className="h-4 w-4" /> {bulkIds.length} unclaimed tag{bulkIds.length === 1 ? '' : 's'}
              </p>
              <p className="max-h-24 overflow-y-auto font-mono text-xs text-muted-foreground">
                {bulkIds.join(', ')}
              </p>
              {bulkSkipped > 0 && (
                <p className="text-xs text-foreground">
                  {bulkSkipped} selected tag{bulkSkipped === 1 ? ' was' : 's were'} skipped: bulk content only applies to
                  unclaimed tags, so owners' own content is never overwritten.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Replaces any existing content on these tags.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-foreground">{tag.tagId}</span>
                <Badge variant="outline" className={TAG_STATUS_BADGE[tag.status] || TAG_STATUS_BADGE.registered}>
                  {tag.status}
                </Badge>
                {scanCount !== null && (
                  <span
                    className="text-xs text-muted-foreground"
                    title="Taps before tag content existed have no mode, so the parts can add up to less than the total."
                  >
                    {scanCount.total} tap{scanCount.total === 1 ? '' : 's'} recorded
                    {scanCount.total > 0 &&
                      ` · Lost & Found ${scanCount.lostfound} · Profile ${scanCount.profile} · Redirect ${scanCount.redirect}`}
                  </span>
                )}
              </div>
              {itemName && <p className="text-muted-foreground">Item: {itemName}</p>}
              {tag.status === 'claimed' && (
                <p className="flex items-start gap-1.5 rounded-xl border border-foreground bg-warning-soft px-3.5 py-2.5 text-xs text-foreground">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                  This tag belongs to an owner. Your save replaces their content, and their NFC profile page will show
                  it was last edited by an admin.
                </p>
              )}
              {tag.status === 'registered' && (
                <p className="text-xs text-muted-foreground">
                  Unclaimed. Setting Profile card or Redirect makes this a TagBack-managed tag that nobody can claim.
                  Set it back to Lost &amp; Found to hand it out to an owner.
                </p>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to={`/nfc/${tag.tagId}?preview=1`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open tap page
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <form onSubmit={onSave}>
        <Card className={CARD}>
          <CardContent className="space-y-5 p-6">
            <TagContentForm profile={profile} setProfile={setProfile} errors={errors} setErrors={setErrors} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" loading={saving} className="gap-1.5">
                {saving ? 'Saving…' : bulk ? `Apply to ${bulkIds.length} tag${bulkIds.length === 1 ? '' : 's'}` : 'Save content'}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/admin/tags">Back to Tag Content</Link>
              </Button>
              {!bulk && hasSaved && !confirmReset && (
                <Button type="button" variant="outline" className="text-foreground" onClick={() => setConfirmReset(true)}>
                  Reset content
                </Button>
              )}
            </div>
            {confirmReset && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-foreground bg-destructive-soft px-3.5 py-2.5 text-sm text-foreground">
                <span className="flex-1">
                  Delete this tag's content? A tap will show the default Lost &amp; Found page. This can't be undone.
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmReset(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={onReset} loading={saving}>
                  Reset
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
