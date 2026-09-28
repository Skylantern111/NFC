import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { MailCheck, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { auth, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { resendWaitMs, sendVerification } from '../../lib/emailVerification';
import GlassCard from '../../components/GlassCard';
import PageHeader from '../../components/PageHeader';
import { InlineAlert } from '../../components/States';
import { Button } from '../../components/ui/button';

const SENDER = 'noreply@nfc-lost-and-found.firebaseapp.com';

// Shown right after owner signup, and linked from the dashboard banner and
// ClaimTag while the email is unverified. DashboardLayout's
// useVerificationWatch notices the click on the email link by itself; this
// page then moves on to the dashboard.
export default function VerifyEmail() {
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
    toast.success('Email verified. You can claim tags now.');
    nav('/dashboard', { replace: true });
  }, [verified, nav]);

  if (!firebaseReady) return <Navigate to="/dashboard" replace />;

  async function onResend() {
    setSending(true);
    setNotYet(false);
    const res = await sendVerification(user);
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
    nav('/register', { replace: true });
  }

  const waitSeconds = Math.ceil(wait / 1000);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Verify your email" description="One last step before you can claim a tag." />

      <GlassCard className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-info-soft">
            <MailCheck className="h-5 w-5 text-info" aria-hidden="true" />
          </span>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            We sent a link to <strong className="break-all">{user?.email}</strong>.
          </p>
        </div>

        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-200">
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

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Wrong address?{' '}
        <button type="button" onClick={onDifferentEmail} className="min-h-11 font-medium text-purple-700 underline dark:text-purple-300">
          Sign up with a different email
        </button>
      </p>
    </div>
  );
}
