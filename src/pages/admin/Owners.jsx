import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, UserX, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { FormError } from '@/components/FormField';
import { EmptyState } from '@/components/States';
import { findOwnerByTag, listOwnerTags, setOwnerDisabled } from '../../lib/adminOwners';
import { normalizeTagbackId } from '../../lib/tags';
import { friendlyFirestoreError, relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// Admin-only lookup: resolve a tag ID to the owner account behind it, and
// see every other tag that same owner holds. Reads itemOwners/users, which
// firestore.rules only opens to isAdmin() — see lib/adminOwners.js.
//
// No Cloud Functions/Admin SDK in this project, so "disable" is a soft
// disable (users/{uid}.disabled): it can't revoke Firebase Auth sign-in, but
// firestore.rules#ownsTag folds it in, so a disabled owner loses every
// owner-gated read/write immediately, everywhere in the app.
export default function Owners() {
  const [searchParams] = useSearchParams();
  const [tagId, setTagId] = useState(searchParams.get('tagId') || '');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [owner, setOwner] = useState(null);
  const [ownerTags, setOwnerTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableReason, setDisableReason] = useState('');

  async function runSearch(rawTerm) {
    const term = normalizeTagbackId(rawTerm);
    if (!term) return;
    setSearching(true);
    setSearched(true);
    setError('');
    setOwner(null);
    setOwnerTags([]);
    try {
      const result = await findOwnerByTag(term);
      if (result.error === 'preview-mode') {
        setError('Owner lookup needs a real Firebase project — not available in preview mode.');
        return;
      }
      if (!result.owner) {
        setError('That tag exists but has no owner yet (still unclaimed), or the tag ID is wrong.');
        return;
      }
      setOwner(result.owner);
      setTagsLoading(true);
      const tags = await listOwnerTags(result.ownerUid);
      setOwnerTags(tags);
    } catch (err) {
      setError(friendlyFirestoreError(err, 'Lookup failed. Try again.'));
    } finally {
      setSearching(false);
      setTagsLoading(false);
    }
  }

  function onSearch(e) {
    e.preventDefault();
    runSearch(tagId);
  }

  // Arriving from admin/Moderation.jsx's "Look up owner" link on a
  // finder-filed report (?tagId=...) — MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md
  // §5.1 — auto-runs the same lookup instead of making the admin re-type
  // the tag id they just clicked through on.
  useEffect(() => {
    const fromLink = searchParams.get('tagId');
    if (fromLink) runSearch(fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onConfirmDisable() {
    if (!owner) return;
    setDisableBusy(true);
    try {
      const next = !owner.disabled;
      await setOwnerDisabled(owner.uid, next, disableReason.trim());
      setOwner((o) => ({ ...o, disabled: next, disabledReason: next ? disableReason.trim() : null }));
      setConfirmDisable(false);
      setDisableReason('');
      toast.success(next ? 'Account disabled.' : 'Account re-enabled.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not update the account. Try again.'));
    } finally {
      setDisableBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Owners"
        tourId="owners-header"
        description="Look up which account holds a tag, see their other tags, and disable an abusive owner."
      />

      <form onSubmit={onSearch} className="flex flex-wrap items-center gap-2" data-tour="owners-search">
        <Input
          aria-label="TagBack ID"
          placeholder="Paste a TagBack ID, e.g. TB-ABCD-2345"
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="max-w-md font-mono text-sm"
        />
        <Button type="submit" variant="primary" disabled={!tagId.trim()} loading={searching} className="gap-1.5">
          {!searching && <Search className="h-4 w-4" />}
          {searching ? 'Looking up…' : 'Look up owner'}
        </Button>
      </form>

      <FormError>{error}</FormError>

      {owner && (
        <>
          <Card className="rounded-lg border-2 border-foreground bg-card shadow-card">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {owner.displayName || owner.email || 'Owner'}
                    {owner.disabled && <StatusBadge state="banned" label="Disabled" />}
                    {/* users/{uid}.emailVerified is written by the owner's own
                    app once verified (AuthContext); informational only. */}
                    <StatusBadge state={owner.emailVerified ? 'email_verified' : 'email_unverified'} />
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {owner.email ? `Sign-up email: ${owner.email}` : 'No email on file'}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={owner.disabled ? 'outline' : 'destructive'}
                  className="gap-1.5"
                  onClick={() => setConfirmDisable(true)}
                >
                  {owner.disabled ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                  {owner.disabled ? 'Re-enable account' : 'Disable account'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner UID</p>
                <p className="font-mono text-xs text-muted-foreground">{owner.uid}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
                <p className="text-muted-foreground">{owner.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Member since</p>
                <p className="text-muted-foreground">
                  {owner.createdAt ? relativeTimeFromMs(toMillis(owner.createdAt)) : '—'}
                </p>
              </div>
              {!owner.emailVerified &&
                owner.createdAt &&
                Date.now() - toMillis(owner.createdAt) > 7 * 24 * 60 * 60 * 1000 && (
                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    Not verified after 7 days — probably a mistyped email. It can be deleted in the Firebase console
                    (see FIREBASE_SETUP.md, cleaning up wrong-email accounts).
                  </p>
                )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-2 border-foreground bg-card shadow-card">
            <CardHeader>
              <CardTitle>
                Tags owned
                {ownerTags.length > 0 && (
                  <span className="ml-1.5 font-normal text-muted-foreground">({ownerTags.length})</span>
                )}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Every tag registered to this account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md sm:overflow-x-auto sm:bg-card sm:border-2 sm:border-foreground">
                <Table className="stack-table">
                  <TableHeader>
                    <TableRow className="border-foreground hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Tag ID</TableHead>
                      <TableHead className="text-muted-foreground">Item</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tagsLoading &&
                      [0, 1, 2].map((i) => (
                        <TableRow key={i} className="border-foreground hover:bg-transparent">
                          {[0, 1, 2].map((c) => (
                            <TableCell key={c}>
                              <Skeleton className="h-4 w-full max-w-28" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    {!tagsLoading && ownerTags.length === 0 && (
                      <TableRow className="border-foreground hover:bg-transparent">
                        <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                          No tags found for this owner.
                        </TableCell>
                      </TableRow>
                    )}
                    {ownerTags.map((t) => (
                      <TableRow key={t.tagId} className="border-foreground">
                        <TableCell data-label="Tag ID" className="font-mono text-xs text-foreground" title={t.tagId}>
                          {t.tagId}
                        </TableCell>
                        <TableCell data-label="Item" className="text-foreground">{t.itemName || '—'}</TableCell>
                        <TableCell data-label="Status">
                          <StatusBadge state={t.status || 'registered'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!searched && (
        <EmptyState icon={Search} title="Look up an owner" description="Paste a TagBack ID above to find the account behind it." />
      )}

      {searched && !searching && !owner && !error && (
        <p role="status" className="text-sm text-muted-foreground">No owner found for that tag.</p>
      )}

      <Dialog
        open={confirmDisable}
        onOpenChange={(open) => {
          setConfirmDisable(open);
          if (!open) setDisableReason('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{owner?.disabled ? 'Re-enable this account?' : 'Disable this account?'}</DialogTitle>
            <DialogDescription>
              {owner?.disabled ? (
                'Restores this owner\'s access to their items, chats, and reports.'
              ) : (
                <>
                  This blocks every owner-gated action for this account — editing items, claiming
                  new tags, chats, notifications — everywhere in the app. It does not sign them
                  out of an already-open session or delete any data, and can be reversed here at
                  any time.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {!owner?.disabled && (
            <div className="space-y-2">
              <Label htmlFor="disable-reason" className="text-muted-foreground">Reason (optional)</Label>
              <Input
                id="disable-reason"
                autoFocus
                placeholder="e.g. reported for scam messages"
                value={disableReason}
                onChange={(e) => setDisableReason(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDisable(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={owner?.disabled ? 'primary' : 'destructive'}
              onClick={onConfirmDisable}
              loading={disableBusy}
            >
              {disableBusy ? 'Saving…' : owner?.disabled ? 'Re-enable' : 'Disable account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
