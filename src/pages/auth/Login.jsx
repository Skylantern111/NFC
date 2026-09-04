import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, firebaseReady } from '../../firebase/config';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import { Button, Field } from '../../components/ui';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!firebaseReady) {
      // Placeholder mode: skip straight to the dashboard for preview.
      nav('/dashboard');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      nav('/dashboard');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!email) return setErr('Enter your email first, then tap reset.');
    if (!firebaseReady) return setErr('Password reset needs Firebase configured.');
    try {
      await sendPasswordResetEmail(auth, email);
      setErr('Reset link sent — check your inbox.');
    } catch (e) {
      setErr(e.message);
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
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {err && <p className="text-sm text-red-500">{err}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Forgot password?
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
