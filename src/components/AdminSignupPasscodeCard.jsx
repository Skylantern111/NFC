import { useEffect, useState } from 'react';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db, firebaseReady } from '../firebase/config';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import ConfirmDialog from './ConfirmDialog';

const MIN_LENGTH = 8; // mirrors firestore.rules#validAdminPasscode

// SYSTEM_AUDIT_ROUND2.md A3: the rules can't rate-limit guesses, so the
// passcode itself has to be hard to guess. 8 characters from a
// 31-symbol alphabet (no 0/O/1/I/L) ≈ 40 bits (8 is the minimum the owner chose).
const PASSCODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function generatePasscode(length = 8) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSCODE_ALPHABET[n % PASSCODE_ALPHABET.length]).join('');
}

// Self-serve admin signup passcode (SYSTEM_AUDIT_PLAN.md A1). Stored in
// meta/adminSignup — admin-only in firestore.rules, never in the client
// bundle — and checked by the rules when admin/AdminRegister.jsx (components/SignupForm.jsx) creates a user
// with isAdmin: true. No doc = self-serve admin signup is off.
export default function AdminSignupPasscodeCard() {
  const [enabled, setEnabled] = useState(null); // null = loading
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false); // show the passcode in clear (after Generate)
  const [confirmOff, setConfirmOff] = useState(false); // UI_UX_IMPROVEMENT_ROUND2.md B9

  useEffect(() => {
    if (!firebaseReady) {
      setEnabled(false);
      return;
    }
    getDoc(doc(db, 'meta', 'adminSignup'))
      .then((snap) => setEnabled(snap.exists() && !!snap.data().passcode))
      .catch(() => setEnabled(false));
  }, []);

  async function onSave(e) {
    e.preventDefault();
    const passcode = value.trim();
    if (passcode.length < MIN_LENGTH) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'meta', 'adminSignup'), {
        passcode,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      });
      setEnabled(true);
      toast.success('Admin signup passcode updated. Copy it now — it is not shown again.');
    } catch (err) {
      toast.error('Could not save passcode: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'meta', 'adminSignup'));
      setEnabled(false);
      setConfirmOff(false);
      toast.success('Self-serve admin signup turned off.');
    } catch (err) {
      toast.error('Could not turn off: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-lg border-2 border-foreground bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Admin signup passcode
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Anyone who types this passcode on the admin signup page (/admin/register) becomes an admin. Checked by the database rules, never shipped to browsers. Turn it off when nobody is being
          onboarded. Status: {enabled === null ? 'loading…' : enabled ? 'on' : 'off (no passcode set)'}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="flex flex-wrap items-center gap-2">
          <Input
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={`New passcode (at least ${MIN_LENGTH} characters)`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="max-w-xs font-mono"
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setValue(generatePasscode());
              setShown(true);
            }}
          >
            Generate
          </Button>
          {shown && value && (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                navigator.clipboard
                  .writeText(value)
                  .then(() => toast.success('Passcode copied.'))
                  .catch(() => toast.error('Could not copy — select and copy it by hand.'))
              }
            >
              Copy
            </Button>
          )}
          <Button type="submit" disabled={busy || value.trim().length < MIN_LENGTH} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {enabled ? 'Change passcode' : 'Set passcode'}
          </Button>
          {enabled && (
            <Button type="button" variant="outline" className="text-foreground" disabled={busy} onClick={() => setConfirmOff(true)}>
              Turn off
            </Button>
          )}
        </form>
        <ConfirmDialog
          open={confirmOff}
          onOpenChange={setConfirmOff}
          title="Turn off admin sign-up?"
          description="The passcode is deleted, so nobody can create an admin account at /admin/register until you set a new one. Existing admins keep their access."
          confirmLabel="Turn off"
          busyLabel="Turning off…"
          busy={busy}
          onConfirm={onDisable}
        />
      </CardContent>
    </Card>
  );
}
