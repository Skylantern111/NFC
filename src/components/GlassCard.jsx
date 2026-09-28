import { cn } from '../lib/utils';

// The one glass content surface (UI_UX_IMPROVEMENT_PLAN.md DS2). `lost`
// swaps to the red "this item is lost" treatment — border and tint only;
// the looping glow pulse is gone (DS9).
export default function GlassCard({ lost = false, className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'glass glass-legible p-5 transition-colors sm:p-6',
        lost && 'border-2 border-red-400 dark:border-red-500/50 bg-red-50/70 dark:bg-red-500/10',
        className
      )}
      {...props}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
