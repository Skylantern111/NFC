import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../../firebase/config';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import { Button, Field } from '../../components/ui';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
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
      setErr(e.message);
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
              <Field
                label="Password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
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
