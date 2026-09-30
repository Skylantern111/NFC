import { memo } from 'react';

// Brutalist "wallpaper": the paper canvas with a faint dot grid and a few
// outlined color blocks anchored to the corners. Static (no animation) and
// non-interactive — it sits behind everything and never re-renders.
function AmbientBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-background"
      aria-hidden="true"
    >
      {/* Faint dot grid — the "engineering paper" base. */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'radial-gradient(hsl(var(--foreground) / 0.12) 1.5px, transparent 1.5px)',
          backgroundSize: '22px 22px',
        }}
      />
      {/* Outlined color blocks, tucked into the corners so content stays clear. */}
      <div className="absolute -top-16 -left-10 hidden h-52 w-52 rotate-6 rounded-lg border-2 border-foreground bg-accent/25 sm:block" />
      <div className="absolute top-1/3 -right-16 hidden h-64 w-64 -rotate-6 rounded-lg border-2 border-foreground bg-primary/15 md:block" />
      <div className="absolute -bottom-20 left-1/4 hidden h-56 w-56 rotate-3 rounded-lg border-2 border-foreground bg-success/20 sm:block" />
    </div>
  );
}

export default memo(AmbientBackground);
