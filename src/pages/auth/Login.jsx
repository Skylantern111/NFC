import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, firebaseReady } from '../../firebase/config';
import { friendlyAuthError } from '../../lib/utils';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import FormField, { FormError } from '../../components/FormField';
import { InlineAlert } from '../../components/States';
import { setPageTitle } from '../../lib/pageTitle';

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setPageTitle('Sign in');
    return () => setPageTitle('');
  }, []);

  const redirectTo = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search || ''}`
    : '/dashboard';

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setInfo('');
    if (!firebaseReady) {
      // Placeholder mode: skip straight to the dashboard for preview.
      nav('/dashboard');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      nav(redirectTo, { replace: true });
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setErr('');
    setInfo('');
    if (!email) return setErr('Type your email above first, then tap “Forgot password?”.');
    if (!firebaseReady) return setErr('Password reset needs Firebase configured.');
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      // UI_UX_IMPROVEMENT_PLAN.md AUTH5: show where it went, so a typo is obvious.
      setInfo(`If an account exists for ${email}, a reset link is on its way. Check your inbox and spam folder.`);
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav fallback="/" />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">
        <h1 className="text-center font-display text-3xl font-bold uppercase tracking-tight text-foreground">Welcome back</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">
          Sign in to manage your tagged items.
        </p>
        <GlassCard>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField id="email" label="Email">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FormField>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-bold text-foreground">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
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
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <FormError>{err}</FormError>
            {info && <InlineAlert tone="success">{info}</InlineAlert>}
            <Button type="submit" variant="primary" loading={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <button
              type="button"
              onClick={onReset}
              disabled={resetting}
              className="min-h-11 text-sm font-bold text-muted-foreground hover:text-foreground hover:underline underline-offset-4 disabled:opacity-50"
            >
              {resetting ? 'Sending reset link…' : 'Forgot password?'}
            </button>
          </form>
        </GlassCard>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link to="/register" className="font-bold text-primary hover:underline underline-offset-4">
            Create one
          </Link>
        </p>
        {!firebaseReady && (
          <p className="mt-4 text-center text-xs font-bold text-foreground">
            Firebase not configured — sign-in is stubbed for preview.
          </p>
        )}
        </main>
      </div>
    </>
  );
}
