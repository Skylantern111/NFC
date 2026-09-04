import { memo } from 'react';

// Fixed, drifting glow orbs behind glass surfaces. Memoized so chat/state
// changes never re-render (and never restart) the animations.
function AmbientBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#151030] via-[#0d0a1a] to-[#0b0514]"
      aria-hidden="true"
    >
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 blur-[120px] opacity-50 animate-drift1" />
      <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-500 blur-[120px] opacity-40 animate-drift2" />
      <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-pink-600 to-purple-500 blur-[120px] opacity-40 animate-drift3" />
    </div>
  );
}

export default memo(AmbientBackground);
