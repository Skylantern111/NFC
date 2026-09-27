import { useEffect, useState } from 'react';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db, firebaseReady } from '../firebase/config';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

const MIN_LENGTH = 6; // mirrors firestore.rules#validAdminPasscode

// Self-serve admin signup passcode (SYSTEM_AUDIT_PLAN.md A1). Stored in
// meta/adminSignup — admin-only in firestore.rules, never in the client
// bundle — and checked by the rules when admin/AdminRegister.jsx (components/SignupForm.jsx) creates a user
// with isAdmin: true. No doc = self-serve admin signup is off.
export default function AdminSignupPasscodeCard() {
  const [enabled, setEnabled] = useState(null); // null = loading
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

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
      setValue('');
      toast.success('Admin signup passcode updated.');
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
      toast.success('Self-serve admin signup turned off.');
    } catch (err) {
      toast.error('Could not turn off: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-3xl bg-white/80 dark:bg-white/5 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Admin signup passcode
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Anyone who types this passcode when creating an account becomes an admin. Checked by the database rules,
          never shipped to browsers. Status:{' '}
          {enabled === null ? 'loading…' : enabled ? 'on' : 'off (no passcode set)'}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder={`New passcode (at least ${MIN_LENGTH} characters)`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit" disabled={busy || value.trim().length < MIN_LENGTH} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {enabled ? 'Change passcode' : 'Set passcode'}
          </Button>
          {enabled && (
            <Button type="button" variant="outline" className="text-rose-600" disabled={busy} onClick={onDisable}>
              Turn off
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
