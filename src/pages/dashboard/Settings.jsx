import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import GlassCard from '../../components/GlassCard';
import { Button, Field } from '../../components/ui';
import { Switch } from '../../components/ui/switch';

const DEFAULT_PREFS = { inApp: true, email: true };

export default function Settings() {
  const { user } = useAuth();
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
      <h1 className="text-2xl font-extrabold text-slate-800">Settings</h1>

      {loading && <p className="text-sm text-slate-500">Loading your settings…</p>}

      <GlassCard>
        <h2 className="mb-3 font-bold text-slate-800">Contact (private)</h2>
        <p className="mb-3 text-sm text-slate-500">
          Only used to reach you. Never shown to finders.
        </p>
        <Field
          label="Phone (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </GlassCard>

      <GlassCard>
        <h2 className="mb-3 font-bold text-slate-800">Notifications</h2>
        {[
          ['inApp', 'In-app alerts'],
          ['email', 'Email alerts'],
        ].map(([k, label]) => (
          <label key={k} className="flex items-center justify-between py-2">
            <span className="text-slate-600">{label}</span>
            <Switch checked={prefs[k]} onCheckedChange={() => toggle(k)} />
          </label>
        ))}
        {status && (
          <p className={`mt-2 text-sm ${status.kind === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
            {status.text}
          </p>
        )}
        <Button className="mt-3 w-full" onClick={onSave} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </GlassCard>
    </div>
  );
}
