import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { toast } from 'sonner';
import { deleteField, doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase/config';
import { profileRepairPaused } from '../context/AuthContext';
import { friendlyAuthError, passwordRequirementResults, passwordStrength } from '../lib/utils';
import { ADMIN_RETURN, OWNER_RETURN, sendVerification } from '../lib/emailVerification';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import FormField, { FormError } from './FormField';

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
//
// Both roles type the email twice and then verify it (EMAIL_OWNERSHIP_PLAN.md
// D1/D3): owners before claiming a tag, passcode admins before any admin
// rights apply.
export default function SignupForm({ admin = false }) {
  const nav = useNavigate();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: '',
    adminPasscode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [err, setErr] = useState('');
  // Field-level errors shown next to the field (UI_UX_IMPROVEMENT_PLAN.md AUTH2/AUTH3).
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFieldErr((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  const requirements = passwordRequirementResults(form.password);
  const allRequirementsMet = requirements.every((r) => r.met);
  const strength = passwordStrength(form.password);
  const confirmTouched = form.confirmPassword.length > 0;
  const passwordsMatch = form.password === form.confirmPassword;

  const STRENGTH_META = {
    weak: { label: 'Weak', className: 'bg-destructive', textClassName: 'text-foreground' },
    medium: { label: 'Medium', className: 'bg-warning', textClassName: 'text-foreground' },
    strong: { label: 'Strong', className: 'bg-success', textClassName: 'text-foreground' },
  };

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    // The button stays enabled; a click explains what's missing and moves
    // focus there, instead of a disabled button with no reason (AUTH2).
    const typedPasscode = form.adminPasscode.trim();
    const next = {};
    if (!form.displayName.trim()) next.displayName = 'Enter your name.';
    if (!form.email.trim()) next.email = 'Enter your email.';
    if (!form.confirmEmail.trim()) next.confirmEmail = 'Type the email again.';
    else if (form.email.trim().toLowerCase() !== form.confirmEmail.trim().toLowerCase()) {
      next.confirmEmail = 'The two emails don’t match.';
    }
    if (!allRequirementsMet) next.password = 'Your password doesn’t meet every requirement below yet.';
    if (!form.confirmPassword) next.confirmPassword = 'Type the password again.';
    else if (!passwordsMatch) next.confirmPassword = 'The two passwords don’t match.';
    if (admin && !typedPasscode) next.adminPasscode = 'Enter the admin passcode.';
    setFieldErr(next);
    const firstBad = Object.keys(next)[0];
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    if (!firebaseReady) {
      nav(admin ? '/admin/inventory' : '/dashboard');
      return;
    }
    setBusy(true);
    profileRepairPaused.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      await updateProfile(cred.user, { displayName: form.displayName });
      // Profile lives in `users` — never exposed to finders. `isAdmin` can
      // only be set here, at creation — firestore.rules blocks changing it
      // via a later update, and only accepts true with the right passcode.
      const userRef = doc(db, 'users', cred.user.uid);
      const profile = {
        uid: cred.user.uid,
        // The login's own (normalized) email — firestore.rules only accepts
        // an email that matches the sign-in token (SYSTEM_AUDIT_ROUND4 B1).
        email: cred.user.email,
        displayName: form.displayName,
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
      // Owners must verify before claiming a tag, passcode admins before any
      // admin rights apply. The account exists either way; if this send
      // fails, the verify page shows why and can resend.
      const sent = await sendVerification(cred.user, { returnTo: admin ? ADMIN_RETURN : OWNER_RETURN });
      toast.success(
        sent.ok
          ? `${admin ? 'Admin account' : 'Account'} created. Check your email to verify it.`
          : `${admin ? 'Admin account' : 'Account'} created.`
      );
      nav(admin ? '/admin/verify-email' : '/dashboard/verify-email', {
        state: sent.ok ? null : { sendError: sent.error },
      });
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      profileRepairPaused.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField id="displayName" label="Name" hint="Only you and TagBack admins see this." error={fieldErr.displayName}>
        <Input value={form.displayName} onChange={set('displayName')} autoComplete="name" autoCapitalize="words" />
      </FormField>
      <FormField
        id="email"
        label="Email"
        hint={
          admin
            ? 'We’ll send a link here. You need it to open the admin console.'
            : 'We’ll send a link here. You need it to claim tags.'
        }
        error={fieldErr.email}
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={form.email}
          onChange={set('email')}
        />
      </FormField>
      {/* autoComplete off so autofill can't copy a typo into both fields. */}
      <FormField id="confirmEmail" label="Confirm email" error={fieldErr.confirmEmail}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          value={form.confirmEmail}
          onChange={set('confirmEmail')}
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-sm font-bold text-foreground">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            aria-describedby={fieldErr.password ? 'password-requirements password-error' : 'password-requirements'}
            aria-invalid={fieldErr.password ? true : undefined}
            className="pr-11"
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

        {form.password.length > 0 && strength && (
          <div className="mt-1 flex items-center gap-2">
            <div className="flex h-2 flex-1 gap-1 overflow-hidden rounded-full border border-foreground bg-muted">
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
                r.met ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {r.met ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              {r.label}
              <span className="sr-only">{r.met ? ' (done)' : ' (not yet)'}</span>
            </li>
          ))}
        </ul>
        {fieldErr.password && (
          <p id="password-error" role="alert" className="text-sm font-semibold text-foreground">
            {fieldErr.password}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword" className="text-sm font-bold text-foreground">Confirm password</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={set('confirmPassword')}
            aria-invalid={fieldErr.confirmPassword ? true : undefined}
            aria-describedby={fieldErr.confirmPassword ? 'confirmPassword-error' : undefined}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldErr.confirmPassword && (
          <p id="confirmPassword-error" role="alert" className="text-sm font-semibold text-foreground">
            {fieldErr.confirmPassword}
          </p>
        )}
        {confirmTouched && !fieldErr.confirmPassword && (
          <p
            className={`flex items-center gap-1.5 text-xs font-semibold text-foreground`}
            aria-live="polite"
          >
            {passwordsMatch ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
          </p>
        )}
      </div>
      {admin && (
        <FormField
          id="adminPasscode"
          label="Admin passcode"
          hint="Given to you by an existing admin."
          error={fieldErr.adminPasscode}
        >
          <Input type="password" autoComplete="off" value={form.adminPasscode} onChange={set('adminPasscode')} />
        </FormField>
      )}
      <FormError>{err}</FormError>
      <Button type="submit" variant="primary" loading={busy}>
        {busy ? 'Creating account…' : admin ? 'Create admin account' : 'Create account'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        See what we store and how to delete it:{' '}
        <Link to="/privacy" className="font-bold text-primary hover:underline underline-offset-4">
          Privacy
        </Link>
      </p>
    </form>
  );
}
