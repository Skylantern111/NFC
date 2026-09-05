import { useState } from 'react';
import { Search, UserX, UserCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { findOwnerByTag, listOwnerTags, setOwnerDisabled } from '../../lib/adminOwners';
import { TAG_STATUS_BADGE } from '../../lib/tags';
import { relativeTimeFromMs, toMillis } from '../../lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const [tagId, setTagId] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [owner, setOwner] = useState(null);
  const [ownerTags, setOwnerTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);

  async function onSearch(e) {
    e.preventDefault();
    const term = tagId.trim();
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
      setError(err.message || 'Lookup failed.');
    } finally {
      setSearching(false);
      setTagsLoading(false);
    }
  }

  async function onConfirmDisable() {
    if (!owner) return;
    setDisableBusy(true);
    try {
      const next = !owner.disabled;
      await setOwnerDisabled(owner.uid, next);
      setOwner((o) => ({ ...o, disabled: next }));
      setConfirmDisable(false);
      toast.success(next ? 'Account disabled.' : 'Account re-enabled.');
    } catch (err) {
      toast.error('Could not update account: ' + err.message);
    } finally {
      setDisableBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Owners</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Look up which account holds a tag, see their other tags, and disable an abusive owner.
        </p>
      </div>

      <form onSubmit={onSearch} className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Paste a tag ID…"
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          className="max-w-md font-mono text-sm"
        />
        <Button type="submit" disabled={searching || !tagId.trim()} className="gap-1.5">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {searching ? 'Looking up…' : 'Look up owner'}
        </Button>
      </form>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {owner && (
        <>
          <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {owner.displayName || owner.email || 'Owner'}
                    {owner.disabled && <Badge variant="destructive">Disabled</Badge>}
                  </CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">
                    {owner.email || 'No email on file'}
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
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Owner UID</p>
                <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{owner.uid}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Phone</p>
                <p className="text-slate-600 dark:text-slate-300">{owner.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Member since</p>
                <p className="text-slate-600 dark:text-slate-300">
                  {owner.createdAt ? relativeTimeFromMs(toMillis(owner.createdAt)) : '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
            <CardHeader>
              <CardTitle>Tags owned</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">
                Every tag registered to this account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl bg-base shadow-neu-pressed-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                      <TableHead className="text-slate-500 dark:text-slate-400">Tag ID</TableHead>
                      <TableHead className="text-slate-500 dark:text-slate-400">Item</TableHead>
                      <TableHead className="text-slate-500 dark:text-slate-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tagsLoading &&
                      [0, 1, 2].map((i) => (
                        <TableRow key={i} className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                          {[0, 1, 2].map((c) => (
                            <TableCell key={c}>
                              <Skeleton className="h-4 w-full max-w-28" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    {!tagsLoading && ownerTags.length === 0 && (
                      <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                        <TableCell colSpan={3} className="py-6 text-center text-slate-500 dark:text-slate-400">
                          No tags found for this owner.
                        </TableCell>
                      </TableRow>
                    )}
                    {ownerTags.map((t) => (
                      <TableRow key={t.tagId} className="border-slate-200 dark:border-slate-700/60">
                        <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-200" title={t.tagId}>
                          {t.tagId.slice(0, 10)}…
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">{t.itemName || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TAG_STATUS_BADGE[t.status] || TAG_STATUS_BADGE.unclaimed}>
                            {t.status || 'unknown'}
                          </Badge>
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
        <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Search className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            <p className="font-bold text-slate-800 dark:text-slate-100">Look up an owner.</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Paste a tag ID above to find the account behind it.
            </p>
          </CardContent>
        </Card>
      )}

      {searched && !searching && !owner && !error && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No result.</p>
      )}

      <Dialog open={confirmDisable} onOpenChange={setConfirmDisable}>
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
          <DialogFooter>
            <Button type="button" variant="outline" autoFocus onClick={() => setConfirmDisable(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={owner?.disabled ? 'default' : 'destructive'}
              onClick={onConfirmDisable}
              disabled={disableBusy}
            >
              {disableBusy ? 'Saving…' : owner?.disabled ? 'Re-enable' : 'Disable account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
