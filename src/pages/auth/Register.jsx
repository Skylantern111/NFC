import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Circle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { toast } from 'sonner';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../../firebase/config';
import { friendlyAuthError, passwordRequirementResults, passwordStrength } from '../../lib/utils';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

// Grants the self-serve admin path (see firestore.rules#isAdmin) when typed
// into the optional passcode field below. Ships in the client bundle by
// design — this is a low-stakes convenience gate, not real access control;
// scripts/setAdmin.js's custom claim is the secure path.
const ADMIN_SIGNUP_PASSCODE = '111';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '', adminPasscode: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const requirements = passwordRequirementResults(form.password);
  const allRequirementsMet = requirements.every((r) => r.met);
  const strength = passwordStrength(form.password);
  const confirmTouched = form.confirmPassword.length > 0;
  const passwordsMatch = form.password === form.confirmPassword;
  const canSubmit = allRequirementsMet && passwordsMatch && form.confirmPassword.length > 0;

  const STRENGTH_META = {
    weak: { label: 'Weak', className: 'bg-red-500', textClassName: 'text-red-600 dark:text-red-400' },
    medium: { label: 'Medium', className: 'bg-amber-500', textClassName: 'text-amber-600 dark:text-amber-400' },
    strong: { label: 'Strong', className: 'bg-emerald-500', textClassName: 'text-emerald-600 dark:text-emerald-400' },
  };

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!allRequirementsMet) {
      setErr('Your password doesn\'t meet all the requirements below yet.');
      return;
    }
    if (!passwordsMatch) {
      setErr('Passwords do not match.');
      return;
    }
    if (!firebaseReady) {
      nav('/dashboard');
      return;
    }
    setBusy(true);
    const grantsAdmin = form.adminPasscode.trim() === ADMIN_SIGNUP_PASSCODE;
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.displayName });
      // Owner profile lives in `users` — never exposed to finders. `isAdmin`
      // can only be set here, at creation — firestore.rules blocks changing
      // it via a later update, so this is the one and only grant point.
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: form.email,
        displayName: form.displayName,
        phone: '',
        notificationPrefs: { inApp: true, email: true },
        isAdmin: grantsAdmin,
        createdAt: serverTimestamp(),
      });
      // Best-effort — account creation already succeeded above, so a failed
      // verification-email send (rare: network) shouldn't block the flow.
      sendEmailVerification(cred.user).catch((err) => console.warn('sendEmailVerification failed:', err));
      toast.success('Account created — check your email to verify it.');
      nav(grantsAdmin ? '/admin/inventory' : '/dashboard');
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
          <h1 className="mb-6 text-center text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            Create account
          </h1>
          <GlassCard>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName">Name</Label>
                <Input id="displayName" value={form.displayName} onChange={set('displayName')} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set('email')} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={set('password')}
                    aria-describedby="password-requirements"
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

                {form.password.length > 0 && strength && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex h-1.5 flex-1 gap-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full transition-all ${STRENGTH_META[strength].className}`}
                        style={{ width: strength === 'weak' ? '33%' : strength === 'medium' ? '66%' : '100%' }}
                      />
                    </div>
                    <span className={`text-xs font-semibold ${STRENGTH_META[strength].textClassName}`}>
                      {STRENGTH_META[strength].label}
                    </span>
                  </div>
                )}

                <ul id="password-requirements" className="mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2" aria-live="polite">
                  {requirements.map((r) => (
                    <li
                      key={r.key}
                      className={`flex items-center gap-1.5 text-xs ${
                        r.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {r.met ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                      {r.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={set('confirmPassword')}
                    className="pr-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmTouched && (
                  <p
                    className={`flex items-center gap-1.5 text-xs ${
                      passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                    }`}
                    aria-live="polite"
                  >
                    {passwordsMatch ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminPasscode">Admin passcode (optional)</Label>
                <Input
                  id="adminPasscode"
                  type="password"
                  autoComplete="off"
                  value={form.adminPasscode}
                  onChange={set('adminPasscode')}
                  placeholder="Leave blank for a regular account"
                />
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              <Button type="submit" disabled={busy || (form.password.length > 0 && !canSubmit)}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </form>
          </GlassCard>
          <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
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
