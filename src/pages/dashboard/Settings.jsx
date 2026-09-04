import { useState } from 'react';
import GlassCard from '../../components/GlassCard';
import { Button, Field } from '../../components/ui';

// TODO(sprint 2): bind to users/{uid}, persist on save.
export default function Settings() {
  const [prefs, setPrefs] = useState({ inApp: true, email: true });
  const [phone, setPhone] = useState('');

  const toggle = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-extrabold drop-shadow-md">Settings</h1>

      <GlassCard>
        <h2 className="mb-3 font-bold">Contact (private)</h2>
        <p className="mb-3 text-sm text-slate-400">
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
        <h2 className="mb-3 font-bold">Notifications</h2>
        {[
          ['inApp', 'In-app alerts'],
          ['email', 'Email alerts'],
        ].map(([k, label]) => (
          <label key={k} className="flex items-center justify-between py-2">
            <span className="text-slate-200">{label}</span>
            <input
              type="checkbox"
              checked={prefs[k]}
              onChange={() => toggle(k)}
              className="h-5 w-5 accent-purple-500"
            />
          </label>
        ))}
        <Button className="mt-3 w-full">Save</Button>
      </GlassCard>
    </div>
  );
}
