export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary:
      'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-neu-flat-sm',
    danger: 'bg-red-600 hover:bg-red-500 text-white shadow-neu-flat-sm',
    ghost: 'bg-base text-slate-700 shadow-neu-flat-sm hover:shadow-neu-pressed-sm',
  };
  return (
    <button
      className={`rounded-full px-4 py-2.5 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-600">{label}</span>
      )}
      <input
        className={`w-full rounded-xl border-none bg-base px-4 py-2.5 text-slate-800 placeholder-slate-400 shadow-neu-pressed-sm outline-none transition-shadow focus:shadow-neu-pressed focus:ring-2 focus:ring-purple-400/40 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-white/50 border border-white/70 text-slate-600',
    green: 'bg-emerald-50/80 border border-emerald-200 text-emerald-600',
    red: 'bg-red-50/80 border border-red-200 text-red-600',
    amber: 'bg-amber-50/80 border border-amber-200 text-amber-600',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
