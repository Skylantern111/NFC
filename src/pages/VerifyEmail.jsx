import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { MailCheck, PencilLine, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { auth, firebaseReady } from '../firebase/config';
import { useAuth, useVerificationWatch } from '../context/AuthContext';
import {
  ADMIN_RETURN,
  OWNER_RETURN,
  changeUnverifiedEmail,
  resendWaitMs,
  sendVerification,
} from '../lib/emailVerification';
import GlassCard from '../components/GlassCard';
import PageHeader from '../components/PageHeader';
import FormField, { FormError } from '../components/FormField';
import { InlineAlert, LoadingState } from '../components/States';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const SENDER = 'noreply@nfc-lost-and-found.firebaseapp.com';

const ROLES = {
  owner: {
    description: 'One last step before you can claim a tag.',
    done: '/dashboard',
    doneToast: 'Email verified. You can claim tags now.',
    returnTo: OWNER_RETURN,
    differentEmail: '/register',
  },
  admin: {
    description: 'One last step before you can open the admin console.',
    done: '/admin/inventory',
    doneToast: 'Email verified. Welcome to the admin console.',
    returnTo: ADMIN_RETURN,
    differentEmail: '/admin/register',
  },
};

// "Wrong email? Change it" (EMAIL_OWNERSHIP_PLAN.md D4). Firebase emails
// the new address; the account keeps the old one until that link is clicked.
function ChangeEmail({ user, returnTo }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ newEmail: '', confirmNewEmail: '', currentPassword: '' });
  const [fieldErr, setFieldErr] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFieldErr((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    const newEmail = form.newEmail.trim();
    const next = {};
    if (!newEmail) next.newEmail = 'Enter the new email.';
    else if (newEmail.toLowerCase() === (user?.email || '').toLowerCase()) next.newEmail = 'That is the email on the account now.';
    if (!form.confirmNewEmail.trim()) next.confirmNewEmail = 'Type the new email again.';
    else if (newEmail && form.confirmNewEmail.trim().toLowerCase() !== newEmail.toLowerCase()) {
      next.confirmNewEmail = 'The two emails don’t match.';
    }
    if (!form.currentPassword) next.currentPassword = 'Enter your password.';
    setFieldErr(next);
    const firstBad = Object.keys(next)[0];
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    setBusy(true);
    const res = await changeUnverifiedEmail(user, form.currentPassword, newEmail, { returnTo });
    setBusy(false);
    if (res.ok) {
      setSentTo(newEmail);
      setForm({ newEmail: '', confirmNewEmail: '', currentPassword: '' });
      return;
    }
    if (['auth/wrong-password', 'auth/invalid-credential', 'auth/requires-recent-login'].includes(res.code)) {
      setFieldErr({ currentPassword: res.error });
      document.getElementById('currentPassword')?.focus();
    } else if (['auth/email-already-in-use', 'auth/invalid-email'].includes(res.code)) {
      setFieldErr({ newEmail: res.error });
      document.getElementById('newEmail')?.focus();
    } else {
      setErr(res.error);
    }
  }

  if (sentTo) {
    return (
      <InlineAlert tone="success" title="Check the new address">
        Link sent to <strong className="break-all">{sentTo}</strong>. The old address stays on the account until you
        click it. After that, sign in with the new address.
      </InlineAlert>
    );
  }

  if (!open) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Wrong email?{' '}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 font-medium text-primary underline"
        >
          Change it
        </button>
      </p>
    );
  }

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center gap-2">
        <PencilLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">Change your email</h2>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField id="newEmail" label="New email" error={fieldErr.newEmail}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={form.newEmail}
            onChange={set('newEmail')}
          />
        </FormField>
        <FormField id="confirmNewEmail" label="Confirm new email" error={fieldErr.confirmNewEmail}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            value={form.confirmNewEmail}
            onChange={set('confirmNewEmail')}
          />
        </FormField>
        <FormField
          id="currentPassword"
          label="Current password"
          hint="Needed to confirm it's you."
          error={fieldErr.currentPassword}
        >
          <Input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={set('currentPassword')}
          />
        </FormField>
        <FormError>{err}</FormError>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="primary" loading={busy}>
            {busy ? 'Sending…' : 'Send link to new email'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

// Shown right after signup, and linked from the dashboard banner and
// ClaimTag while an owner's email is unverified. `role="admin"` is the
// passcode-admin version (/admin/verify-email, EMAIL_OWNERSHIP_PLAN.md
// §1.4): same steps, but done means the admin console.
// useVerificationWatch (DashboardLayout for owners, AdminVerifyEmail for
// admins) notices the click on the email link by itself; this page then
// moves on.
export default function VerifyEmail({ role = 'owner' }) {
  const meta = ROLES[role];
  const { user, refreshUser } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [sendError, setSendError] = useState(location.state?.sendError || '');
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const [wait, setWait] = useState(resendWaitMs());

  // Resend countdown.
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(resendWaitMs()), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const verified = !!user?.emailVerified;
  useEffect(() => {
    if (!verified) return;
    toast.success(meta.doneToast);
    nav(meta.done, { replace: true });
  }, [verified, nav, meta]);

  if (!firebaseReady) return <Navigate to={meta.done} replace />;

  async function onResend() {
    setSending(true);
    setNotYet(false);
    const res = await sendVerification(user, { returnTo: meta.returnTo });
    setSending(false);
    setWait(resendWaitMs());
    if (res.ok) {
      setSendError('');
      toast.success(`Email sent to ${user.email}.`);
    } else {
      setSendError(res.error);
    }
  }

  async function onCheck() {
    setChecking(true);
    try {
      const ok = await refreshUser();
      setNotYet(!ok);
    } catch {
      setNotYet(true);
    } finally {
      setChecking(false);
    }
  }

  async function onDifferentEmail() {
    await signOut(auth);
    nav(meta.differentEmail, { replace: true });
  }

  const waitSeconds = Math.ceil(wait / 1000);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Verify your email" description={meta.description} />

      <GlassCard className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-info-soft">
            <MailCheck className="h-5 w-5 text-foreground" aria-hidden="true" />
          </span>
          <p className="text-sm text-foreground">
            We sent a link to <strong className="break-all">{user?.email}</strong>.
          </p>
        </div>

        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>Open the email from TagBack.</li>
          <li>Tap the verification link.</li>
          <li>Come back here. This page updates by itself.</li>
        </ol>

        <InlineAlert tone="info" title="Can't find it?">
          Check your Spam and Promotions folders. It comes from <span className="break-all">{SENDER}</span> and can
          take a minute or two.
        </InlineAlert>

        {sendError && (
          <InlineAlert tone="danger" role="alert" title="The email wasn't sent">
            {sendError}
          </InlineAlert>
        )}
        {notYet && (
          <InlineAlert tone="warning" title="Not verified yet">
            Tap the link in the email first. If it has expired, send a new one.
          </InlineAlert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" className="gap-1.5" onClick={onCheck} loading={checking}>
            {!checking && <RefreshCw className="h-4 w-4" />}
            {checking ? 'Checking…' : "I've verified"}
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={onResend} loading={sending} disabled={wait > 0}>
            {!sending && <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : wait > 0 ? `Resend in ${waitSeconds}s` : 'Resend email'}
          </Button>
        </div>
      </GlassCard>

      <ChangeEmail user={user} returnTo={meta.returnTo} />

      <p className="text-center text-sm text-muted-foreground">
        Or{' '}
        <button type="button" onClick={onDifferentEmail} className="min-h-11 font-medium text-primary underline">
          sign up with a different email
        </button>
      </p>
    </div>
  );
}

// /admin/verify-email: outside AdminGate, which would refuse an unverified
// passcode admin. Its own small guard: signed-in only. Also runs the
// verification watch and handles the email's ?verified=1 return, which
// DashboardLayout does for owners.
export function AdminVerifyEmail() {
  const { user, loading, refreshUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const returned = params.get('verified') === '1';
  useVerificationWatch();
  useEffect(() => {
    if (!returned || !user) return;
    refreshUser().catch(() => {});
    const next = new URLSearchParams(params);
    next.delete('verified');
    setParams(next, { replace: true });
  }, [returned, user, refreshUser, params, setParams]);

  if (!firebaseReady) return <Navigate to="/admin/inventory" replace />;
  if (loading) return <LoadingState variant="page" />;
  if (!user) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-base px-4 py-8 sm:px-8">
      <main id="main" tabIndex={-1} className="outline-none">
        <VerifyEmail role="admin" />
      </main>
    </div>
  );
}
