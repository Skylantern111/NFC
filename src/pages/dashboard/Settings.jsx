import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import GlassCard from '../../components/GlassCard';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';

const DEFAULT_PREFS = { inApp: true, email: true };

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'success' | 'error', text }

  useEffect(() => {
    if (!firebaseReady || !user) {
      setLoading(false);
      return;
    }
    let live = true;
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (!live || !snap.exists()) return;
        const data = snap.data();
        setPhone(data.phone || '');
        setPrefs({ ...DEFAULT_PREFS, ...(data.notificationPrefs || {}) });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user]);

  const toggle = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  async function onSave() {
    setStatus(null);
    if (!firebaseReady || !user) {
      setStatus({ kind: 'error', text: 'Sign in required to save settings.' });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        phone,
        notificationPrefs: prefs,
      });
      setStatus({ kind: 'success', text: 'Settings saved.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err.message || 'Could not save settings.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Settings</h1>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading your settings…</p>}

      <GlassCard>
        <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Appearance</h2>
        <label className="flex items-center justify-between py-2">
          <span className="text-slate-600 dark:text-slate-300">Dark mode</span>
          <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
        </label>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Contact (private)</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Only used to reach you. Never shown to finders.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-3 font-bold text-slate-800 dark:text-slate-100">Notifications</h2>
        <label className="flex items-center justify-between py-2">
          <span className="text-slate-600 dark:text-slate-300">In-app alerts</span>
          <Switch checked={prefs.inApp} onCheckedChange={() => toggle('inApp')} />
        </label>
        {/* No email-sending backend exists in this project (no Cloud
            Function, no email service — see IMPROVEMENT_PLAN.md Round 10
            #4). Disabled rather than left toggleable, so turning it "on"
            can't imply a delivery channel that doesn't exist. The
            underlying notificationPrefs.email field is untouched — this is
            copy/UI only, ready to re-enable once a real send path exists. */}
        <label className="flex items-center justify-between py-2 opacity-60">
          <span className="text-slate-600 dark:text-slate-300">Email alerts (coming soon)</span>
          <Switch checked={false} disabled />
        </label>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Email delivery isn't set up yet — for now, alerts only show up in-app.
        </p>
        {status && (
          <p className={`mt-2 text-sm ${status.kind === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
            {status.text}
          </p>
        )}
        <Button className="mt-3 w-full" onClick={onSave} disabled={saving || loading}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </GlassCard>
    </div>
  );
}
