import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../../firebase/config';
import { friendlyAuthError } from '../../lib/utils';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import { Button, Field } from '../../components/ui';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (form.password !== form.confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }
    if (!firebaseReady) {
      nav('/dashboard');
      return;
    }
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.displayName });
      // Owner profile lives in `users` — never exposed to finders.
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: form.email,
        displayName: form.displayName,
        phone: '',
        notificationPrefs: { inApp: true, email: true },
        createdAt: serverTimestamp(),
      });
      nav('/dashboard');
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav fallback="/" />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">
          <h1 className="mb-6 text-center text-3xl font-extrabold text-slate-800">
            Create account
          </h1>
          <GlassCard>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Field label="Name" value={form.displayName} onChange={set('displayName')} required />
              <Field label="Email" type="email" value={form.email} onChange={set('email')} required />
              <div className="relative">
                <Field
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set('password')}
                  minLength={6}
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
              <Field
                label="Confirm password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                minLength={6}
                required
              />
              {err && <p className="text-sm text-red-500">{err}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </form>
          </GlassCard>
          <p className="mt-5 text-center text-sm text-slate-500">
            Have an account?{' '}
            <Link to="/login" className="font-semibold text-purple-600 hover:text-pink-600">
              Sign in
            </Link>
          </p>
        </main>
      </div>
    </>
  );
}
