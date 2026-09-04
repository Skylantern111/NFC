import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, firebaseReady } from '../../firebase/config';
import { friendlyAuthError } from '../../lib/utils';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import { Button, Field } from '../../components/ui';

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
    if (!email) return setErr('Enter your email first, then tap reset.');
    if (!firebaseReady) return setErr('Password reset needs Firebase configured.');
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo('Reset link sent — check your inbox.');
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
        <h1 className="mb-6 text-center text-3xl font-extrabold text-slate-800">
          Welcome back
        </h1>
        <GlassCard>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="relative">
              <Field
                label="Password"
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
                className="absolute right-3 top-[2.35rem] text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
            {info && <p className="text-sm text-emerald-600">{info}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <button
              type="button"
              onClick={onReset}
              disabled={resetting}
              className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50"
            >
              {resetting ? 'Sending reset link…' : 'Forgot password?'}
            </button>
          </form>
        </GlassCard>
        <p className="mt-5 text-center text-sm text-slate-500">
          No account?{' '}
          <Link to="/register" className="font-semibold text-purple-600 hover:text-pink-600">
            Create one
          </Link>
        </p>
        {!firebaseReady && (
          <p className="mt-4 text-center text-xs text-amber-600">
            Firebase not configured — sign-in is stubbed for preview.
          </p>
        )}
        </main>
      </div>
    </>
  );
}
