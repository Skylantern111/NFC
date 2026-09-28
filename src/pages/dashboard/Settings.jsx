import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { deleteMyAccount } from '../../lib/account';
import { friendlyAuthError, friendlyFirestoreError } from '../../lib/utils';
import GlassCard from '../../components/GlassCard';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import FormField from '../../components/FormField';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState('');

  // SYSTEM_AUDIT_ROUND4.md C2: a private phone number used to be collected
  // here, but nothing ever used it. The field is gone; an old stored value is
  // cleared quietly the next time Settings opens.
  useEffect(() => {
    if (!firebaseReady || !user) return;
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (snap.exists() && 'phone' in snap.data()) {
          return updateDoc(doc(db, 'users', user.uid), { phone: deleteField() });
        }
        return null;
      })
      .catch(() => {});
  }, [user]);

  async function onDeleteAccount(e) {
    e.preventDefault();
    if (confirmText !== 'DELETE' || !password) return;
    setDeleting(true);
    try {
      await deleteMyAccount(password, setProgress);
      toast.success('Your account and its data were deleted.');
      nav('/', { replace: true });
    } catch (err) {
      setProgress('');
      toast.error(
        err?.code?.startsWith?.('auth/')
          ? friendlyAuthError(err)
          : friendlyFirestoreError(err, 'Could not delete everything. Try again, or contact the admin.')
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Settings" />

      <GlassCard>
        <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">Appearance</h2>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm text-slate-700 dark:text-slate-200">Dark mode</span>
          <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
        </label>
      </GlassCard>

      {user && (
        <GlassCard>
          <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">Account</h2>
          <p className="break-all text-sm text-slate-700 dark:text-slate-200">{user.email}</p>
          <div className="mt-2">
            <StatusBadge
              state={user.emailVerified ? 'claimed' : 'review'}
              label={user.emailVerified ? 'Email verified' : 'Email not verified'}
            />
          </div>
          {!user.emailVerified && (
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard/verify-email">Verify my email</Link>
              </Button>
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">Notifications</h2>
        {/* SYSTEM_AUDIT_ROUND2.md B6 / UI_UX_IMPROVEMENT_PLAN.md OWN5: no
            switches for channels that don't exist — alerts are in-app only
            (no email backend on the Spark plan). */}
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Alerts show in the app: the Messages badge, Notifications, and the browser tab title. Email alerts aren't
          available yet.
        </p>
      </GlassCard>

      {user && (
        <GlassCard>
          <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">Privacy</h2>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            See what TagBack stores, who can see it, and how long it's kept on the{' '}
            <Link to="/privacy" className="font-semibold text-purple-700 underline-offset-2 hover:underline dark:text-purple-300">
              Privacy page
            </Link>
            .
          </p>
        </GlassCard>
      )}

      {/* OWN4: the one irreversible action lives on its own. */}
      {user && (
        <section
          aria-labelledby="danger-heading"
          className="rounded-3xl border border-red-200 dark:border-red-500/30 bg-destructive-soft p-5 sm:p-6"
        >
          <h2 id="danger-heading" className="font-bold text-red-800 dark:text-red-200">
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            Delete your account and everything linked to it.
          </p>
          <Button variant="destructive" className="mt-3" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </section>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteOpen(open);
          if (!open) {
            setConfirmText('');
            setPassword('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-red-600" aria-hidden="true" /> Delete your account?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your account, your items and their tap pages, and every finder report, chat and
              notification on your tags. Your tags return to stock (blacklisted tags stay blacklisted). This can't be
              undone.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onDeleteAccount} className="flex flex-col gap-4">
            <FormField id="delete-confirm" label={<>Type <span className="font-mono font-bold">DELETE</span> to confirm</>}>
              <Input
                autoComplete="off"
                autoCapitalize="characters"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={deleting}
              />
            </FormField>
            <FormField id="delete-password" label="Your password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={deleting}
              />
            </FormField>
            {progress && (
              <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
                {progress}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                loading={deleting}
                disabled={confirmText !== 'DELETE' || !password}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
