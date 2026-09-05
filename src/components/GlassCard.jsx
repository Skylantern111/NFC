// Core frosted-glass surface. `lost` swaps to the neon red alert treatment
// used for items in Lost Mode.
export default function GlassCard({ lost = false, className = '', children }) {
  const base =
    'glass glass-legible p-6 transition-colors ' +
    (lost
      ? 'border-red-400 dark:border-red-500/50 border-2 bg-red-50/60 dark:bg-red-500/10 shadow-[0_0_24px_rgba(239,68,68,0.25)] animate-pulseGlow'
      : '');
  return (
    <div className={`${base} ${className}`}>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
