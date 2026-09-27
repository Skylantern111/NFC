import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { sendEmailVerification } from 'firebase/auth';
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { deleteMyAccount } from '../../lib/account';
import { friendlyAuthError, friendlyFirestoreError } from '../../lib/utils';
import GlassCard from '../../components/GlassCard';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
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
  const { user, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();
  const [resending, setResending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  async function onResendVerification() {
    if (!user) return;
    setResending(true);
    try {
      await sendEmailVerification(user);
      toast.success('Verification email sent — check your inbox.');
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setResending(false);
    }
  }

  async function onRefreshVerification() {
    setRefreshing(true);
    try {
      await refreshUser();
    } finally {
      setRefreshing(false);
    }
  }

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
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Settings</h1>

      <GlassCard>
        <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Appearance</h2>
        <label className="flex items-center justify-between py-2">
          <span className="text-slate-600 dark:text-slate-300">Dark mode</span>
          <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
        </label>
      </GlassCard>

      {user && (
        <GlassCard>
          <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Account</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
          <p
            className={`mt-0.5 text-xs font-semibold ${
              user.emailVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {user.emailVerified ? 'Email verified' : 'Email not verified'}
          </p>
          {!user.emailVerified && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onResendVerification}
                disabled={resending}
              >
                {resending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {resending ? 'Sending…' : 'Resend verification email'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={onRefreshVerification}
                disabled={refreshing}
              >
                {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {refreshing ? 'Checking…' : "I've verified — refresh status"}
              </Button>
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Notifications</h2>
        {/* SYSTEM_AUDIT_ROUND2.md B6: there used to be an "In-app alerts"
            switch here that nothing read — alerts always showed. */}
        <p className="py-2 text-sm text-slate-600 dark:text-slate-300">
          In-app alerts are always on: the bell badge and the browser tab show new reports and messages.
        </p>
        {/* No email-sending backend exists in this project (no Cloud Function,
            no email service). Disabled, so it can't imply a channel that
            doesn't exist. */}
        <label className="flex items-center justify-between py-2 opacity-60">
          <span className="text-slate-600 dark:text-slate-300">Email alerts (coming soon)</span>
          <Switch checked={false} disabled />
        </label>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Email delivery isn't set up yet — for now, alerts only show up in-app.
        </p>
      </GlassCard>

      {user && (
        <GlassCard>
          <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">Privacy</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            What TagBack stores and for how long:{' '}
            <Link to="/privacy" className="font-semibold text-purple-600 hover:text-pink-600">
              Privacy
            </Link>
            .
          </p>
          <Button variant="outline" className="mt-4 w-full text-rose-600" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </GlassCard>
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
              <TriangleAlert className="h-5 w-5 text-rose-600" /> Delete your account?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your account, your items and their NFC profiles, and every finder report, chat
              and notification on your tags. Your tags return to stock (blacklisted tags stay blacklisted). This can't be
              undone.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onDeleteAccount} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                autoComplete="off"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={deleting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-password">Your password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={deleting}
              />
            </div>
            {progress && <p className="text-sm text-slate-500 dark:text-slate-400">{progress}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="gap-1.5"
                disabled={deleting || confirmText !== 'DELETE' || !password}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
