import { cn } from '../lib/utils';

// The one content surface (now a brutalist block via `.glass`). `lost`
// swaps to the coral "this item is lost" treatment — tint only; the black
// frame and hard shadow stay so it still reads as the same card family.
export default function GlassCard({ lost = false, className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'glass glass-legible p-5 transition-colors sm:p-6',
        lost && 'bg-destructive-soft',
        className
      )}
      {...props}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
