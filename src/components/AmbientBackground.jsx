import { memo } from 'react';

// Static neumorphic "wallpaper" — abstract shapes extruded from the base
// canvas via neu-flat. No animation: neumorphic shadows read as physical
// surfaces, and drifting/scaling them breaks that illusion (a "solid"
// object shouldn't visibly deform). Memoized so chat/state churn never
// re-renders this.
function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-base" aria-hidden="true">
      <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-base shadow-neu-flat opacity-90" />
      <div className="absolute top-1/4 -right-24 h-96 w-96 rounded-[3rem] bg-base shadow-neu-flat opacity-80" />
      <div className="absolute bottom-10 left-1/5 h-56 w-40 rounded-full bg-base shadow-neu-flat opacity-70" />
      <div className="absolute -bottom-24 right-1/4 h-80 w-80 rounded-[4rem] bg-base shadow-neu-flat opacity-80" />
      <div className="absolute top-1/2 left-1/3 h-24 w-24 -translate-y-1/2 rounded-3xl bg-base shadow-neu-flat-sm opacity-60" />
    </div>
  );
}

export default memo(AmbientBackground);
