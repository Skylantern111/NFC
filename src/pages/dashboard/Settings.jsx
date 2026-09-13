import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { friendlyAuthError, friendlyFirestoreError } from '../../lib/utils';
import GlassCard from '../../components/GlassCard';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Skeleton } from '../../components/ui/skeleton';

const DEFAULT_PREFS = { inApp: true, email: true };

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!firebaseReady || !user) {
      setLoading(false);
      return;
    }
    let live = true;
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (!live || !snap.exists()) return;
        const data = snap.data();
        setPhone(data.phone || '');
        setPrefs({ ...DEFAULT_PREFS, ...(data.notificationPrefs || {}) });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user]);

  const toggle = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

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

  async function onSave() {
    if (!firebaseReady || !user) {
      toast.error('Sign in required to save settings.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        phone,
        notificationPrefs: prefs,
      });
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(friendlyFirestoreError(err, 'Could not save settings. Try again.'));
    } finally {
      setSaving(false);
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

      {loading ? (
        <>
          <GlassCard>
            <Skeleton className="mb-3 h-5 w-32" />
            <Skeleton className="h-9 w-full" />
          </GlassCard>
          <GlassCard>
            <Skeleton className="mb-3 h-5 w-32" />
            <Skeleton className="mb-2 h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </GlassCard>
        </>
      ) : (
        <>
          <GlassCard>
            <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Contact (private)</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Only used to reach you. Never shown to finders.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Notifications</h2>
            <label className="flex items-center justify-between py-2">
              <span className="text-slate-600 dark:text-slate-300">In-app alerts</span>
              <Switch checked={prefs.inApp} onCheckedChange={() => toggle('inApp')} />
            </label>
            {/* No email-sending backend exists in this project (no Cloud
                Function, no email service — see IMPROVEMENT_PLAN.md Round 10
                #4). Disabled rather than left toggleable, so turning it "on"
                can't imply a delivery channel that doesn't exist. The
                underlying notificationPrefs.email field is untouched — this is
                copy/UI only, ready to re-enable once a real send path exists. */}
            <label className="flex items-center justify-between py-2 opacity-60">
              <span className="text-slate-600 dark:text-slate-300">Email alerts (coming soon)</span>
              <Switch checked={false} disabled />
            </label>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Email delivery isn't set up yet — for now, alerts only show up in-app.
            </p>
            <Button className="mt-3 w-full gap-1.5" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </GlassCard>
        </>
      )}
    </div>
  );
}
