import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Circle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { toast } from 'sonner';
import { deleteField, doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase/config';
import { signupInProgress } from '../context/AuthContext';
import { friendlyAuthError, passwordRequirementResults, passwordStrength } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

// Account-creation form shared by the owner signup (auth/Register.jsx) and
// the separate admin signup (admin/AdminRegister.jsx), so both keep the
// same password rules.
//
// `admin`: adds a required passcode field and creates the users/{uid} doc
// with isAdmin: true. firestore.rules only accepts that when the passcode
// matches meta/adminSignup.passcode (SYSTEM_AUDIT_PLAN.md A1) — the browser
// never decides who is admin. On a wrong passcode the just-created Auth
// user is deleted again, so no stray owner account is left behind. The
// passcode copy on the new doc is removed right after a successful create.
export default function SignupForm({ admin = false }) {
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
    const typedPasscode = form.adminPasscode.trim();
    if (admin && !typedPasscode) {
      setErr('Enter the admin passcode.');
      return;
    }
    if (!firebaseReady) {
      nav(admin ? '/admin/inventory' : '/dashboard');
      return;
    }
    setBusy(true);
    signupInProgress.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.displayName });
      // Profile lives in `users` — never exposed to finders. `isAdmin` can
      // only be set here, at creation — firestore.rules blocks changing it
      // via a later update, and only accepts true with the right passcode.
      const userRef = doc(db, 'users', cred.user.uid);
      const profile = {
        uid: cred.user.uid,
        email: form.email,
        displayName: form.displayName,
        phone: '',
        notificationPrefs: { inApp: true, email: true },
        createdAt: serverTimestamp(),
      };
      if (admin) {
        try {
          await setDoc(userRef, { ...profile, isAdmin: true, adminPasscode: typedPasscode });
        } catch (err) {
          if (err.code !== 'permission-denied') throw err;
          // Wrong passcode (or admin signup turned off): don't leave a
          // half-made account behind — remove the Auth user just created.
          await cred.user.delete().catch(() => {});
          setErr('That admin passcode is not correct, or admin signup is turned off. No account was created.');
          return;
        }
        await updateDoc(userRef, { adminPasscode: deleteField() }).catch(() => {});
      } else {
        await setDoc(userRef, { ...profile, isAdmin: false });
      }
      // Best-effort — account creation already succeeded above, so a failed
      // verification-email send (rare: network) shouldn't block the flow.
      sendEmailVerification(cred.user).catch((err) => console.warn('sendEmailVerification failed:', err));
      toast.success('Account created — check your email to verify it.');
      nav(admin ? '/admin/inventory' : '/dashboard');
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      signupInProgress.current = false;
      setBusy(false);
    }
  }

  return (
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
      {admin && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adminPasscode">Admin passcode</Label>
          <Input
            id="adminPasscode"
            type="password"
            autoComplete="off"
            value={form.adminPasscode}
            onChange={set('adminPasscode')}
            placeholder="Given to you by an existing admin"
            required
          />
        </div>
      )}
      {err && <p className="text-sm text-red-500">{err}</p>}
      <Button type="submit" disabled={busy || (form.password.length > 0 && !canSubmit)}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? 'Creating…' : admin ? 'Create admin account' : 'Create account'}
      </Button>
    </form>
  );
}
