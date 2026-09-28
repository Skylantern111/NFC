import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, getCountFromServer, getDoc } from 'firebase/firestore';
import { Bug, ChevronRight, KeyRound, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { friendlyAuthError } from '../../lib/utils';
import AdminSignupPasscodeCard from '../../components/AdminSignupPasscodeCard';
import DevTagRegisterCard from '../../components/DevTagRegisterCard';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

const CARD = 'rounded-3xl bg-white/80 dark:bg-white/5 shadow-card';

// Admin Settings: the admin's own account plus the console-wide settings
// and tools that aren't part of daily tag work, so they don't crowd the
// daily pages: the admin sign-up passcode (was on Owners), the error log
// (was a sidebar entry) and the test-tag fallback (was on NFC Register).
export default function AdminSettings() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();
  const [access, setAccess] = useState(null); // 'claim' | 'passcode' | null
  const [errorCount, setErrorCount] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!firebaseReady || !user) return;
    let cancelled = false;
    Promise.all([
      user.getIdTokenResult().catch(() => null),
      getDoc(doc(db, 'users', user.uid)).catch(() => null),
    ]).then(([token, snap]) => {
      if (cancelled) return;
      if (token?.claims?.admin === true) setAccess('claim');
      else if (snap?.exists() && snap.data().isAdmin === true) setAccess('passcode');
    });
    getCountFromServer(collection(db, 'clientErrors'))
      .then((res) => !cancelled && setErrorCount(res.data().count))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onResetPassword() {
    if (!user?.email) return;
    setSending(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success(`Password reset link sent to ${user.email}.`);
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setSending(false);
    }
  }

  async function onLogout() {
    if (firebaseReady) await logout();
    nav('/');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Settings" description="Your admin account, console settings and maintenance tools." />

      <Card className={CARD}>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="break-all text-sm text-slate-800 dark:text-slate-100">{user?.email || 'Preview mode'}</p>
            {access && (
              <div className="mt-1.5">
                <StatusBadge
                  state="claimed"
                  label={access === 'claim' ? 'Admin (set by the setup script)' : 'Admin (signed up with passcode)'}
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onResetPassword} loading={sending} disabled={!user?.email}>
              {!sending && <KeyRound className="h-3.5 w-3.5" />}
              {sending ? 'Sending…' : 'Change password'}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onLogout}>
              <LogOut className="h-3.5 w-3.5" /> Log out
            </Button>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Change password emails you a reset link.
          </p>
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm text-slate-700 dark:text-slate-200">Dark mode</span>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </label>
        </CardContent>
      </Card>

      <section aria-labelledby="access-heading" className="space-y-2">
        <h2 id="access-heading" className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Admin access
        </h2>
        <AdminSignupPasscodeCard />
      </section>

      <section aria-labelledby="maint-heading" className="space-y-2">
        <h2 id="maint-heading" className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Maintenance
        </h2>
        <Link
          to="/admin/errors"
          className={`${CARD} flex min-h-16 items-center gap-3 p-4 transition-colors hover:bg-white dark:hover:bg-white/10`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft">
            <Bug className="h-5 w-5 text-warning" aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-slate-800 dark:text-slate-100">Error log</span>
            <span className="block text-sm text-slate-600 dark:text-slate-400">
              {errorCount === null
                ? 'Crashes reported from people’s browsers.'
                : errorCount === 0
                  ? 'No errors reported.'
                  : `${errorCount} error report${errorCount === 1 ? '' : 's'} saved.`}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
        </Link>
      </section>

      <section aria-labelledby="dev-heading" className="space-y-2">
        <h2 id="dev-heading" className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Developer tools
        </h2>
        <DevTagRegisterCard className={CARD} />
        <p className="px-1 text-xs text-slate-600 dark:text-slate-400">
          For testing only. Register real tags on NFC Register, using a phone that can scan.
        </p>
      </section>
    </div>
  );
}
