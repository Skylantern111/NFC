import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, MailCheck, ShieldAlert } from 'lucide-react';
import { sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, firebaseReady } from '../../firebase/config';
import { friendlyAuthError } from '../../lib/utils';
import { getAdminStatus } from '../../lib/adminAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Dedicated lock screen for /admin/* — deliberately not a copy of the owner
// Login.jsx look (no AmbientBackground/GlassCard blur), matching
// AdminLayout's solid "ops console" surface and AdminSidebar's amber accent.
// Admin status comes from either the real custom claim (scripts/setAdmin.js,
// out-of-band) or the self-serve passcode flag set at signup
// (AdminRegister.jsx/firestore.rules#isAdmin) — checkIsAdmin() checks both.
export default function AdminLogin() {
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState(location.state?.notice || '');
  const [busy, setBusy] = useState(false);
  // SYSTEM_AUDIT_ROUND2.md B7: a passcode-created admin must verify their
  // email before the admin console opens (firestore.rules#isAdmin checks it
  // too). Arriving with state.verify (from admin signup or AdminGate) and
  // still signed in shows this step straight away.
  const [verifyUser, setVerifyUser] = useState(() =>
    location.state?.verify && firebaseReady ? auth.currentUser : null
  );
  const [info, setInfo] = useState('');

  const redirectTo = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search || ''}`
    : '/admin/inventory';

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!firebaseReady) {
      nav('/admin/inventory');
      return;
    }
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const status = await getAdminStatus(cred.user);
      if (status === 'unverified') {
        setVerifyUser(cred.user);
        return;
      }
      if (status !== 'admin') {
        await signOut(auth);
        setErr("This account doesn't have admin access.");
        return;
      }
      nav(redirectTo, { replace: true });
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setErr('');
    setInfo('');
    setBusy(true);
    try {
      await sendEmailVerification(verifyUser);
      setInfo('Verification email sent — check your inbox (and spam).');
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifiedContinue() {
    setErr('');
    setInfo('');
    setBusy(true);
    try {
      const status = await getAdminStatus(verifyUser);
      if (status === 'admin') nav(redirectTo, { replace: true });
      else if (status === 'unverified') setErr("Your email isn't verified yet. Open the link in the email, then try again.");
      else setErr("This account doesn't have admin access.");
    } finally {
      setBusy(false);
    }
  }

  if (verifyUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base px-5 py-8">
        <Card className="w-full max-w-sm rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <MailCheck className="h-5.5 w-5.5" />
            </span>
            <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Verify your email</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Admin access needs a verified email. We sent a link to{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{verifyUser.email}</span>. Open it, then
              continue here.
            </p>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            {info && <p className="text-sm text-emerald-600">{info}</p>}
            <Button className="w-full gap-1.5" onClick={onVerifiedContinue} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              I've verified — continue
            </Button>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" onClick={onResend} disabled={busy}>
                Resend email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut(auth);
                  setVerifyUser(null);
                  setErr('');
                  setInfo('');
                }}
              >
                Use another account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-5 py-8">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300">
          <ShieldAlert className="h-5.5 w-5.5" />
        </span>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Admin console</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Restricted access. Sign in to continue.</p>
      </div>
      <Card className="w-full max-w-sm rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
        <CardHeader className="sr-only">
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>Sign in with an admin account.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-5 flex flex-col items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/login" className="hover:text-slate-800 dark:hover:text-slate-100">
          Not an admin? Go to owner sign in
        </Link>
        <Link to="/admin/register" className="hover:text-slate-800 dark:hover:text-slate-100">
          Need an admin account? Create one with the admin passcode
        </Link>
      </div>
      {!firebaseReady && (
        <p className="mt-4 text-center text-xs text-amber-600">
          Firebase not configured — sign-in is stubbed for preview.
        </p>
      )}
    </div>
  );
}
