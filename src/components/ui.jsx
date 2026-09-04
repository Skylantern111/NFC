export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary:
      'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-lg shadow-purple-950/40',
    danger: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40',
    ghost: 'bg-white/10 hover:bg-white/20 text-white border border-white/15',
  };
  return (
    <button
      className={`rounded-full px-4 py-2.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      )}
      <input
        className={`w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-white placeholder-slate-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/40 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-700/60 text-slate-200',
    green: 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40',
    red: 'bg-red-600/30 text-red-300 border border-red-500/40',
    amber: 'bg-amber-600/30 text-amber-300 border border-amber-500/40',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
