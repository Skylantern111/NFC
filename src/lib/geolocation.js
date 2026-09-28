// Non-blocking location capture. Never throws: resolves `{ location, reason }`
// where `location` is null on failure and `reason` says why ('denied' |
// 'timeout' | 'unavailable' | 'unsupported'), so the finder page can say
// something useful instead of one generic "Unavailable"
// (UI_UX_IMPROVEMENT_PLAN.md BUG6).
//
// Rounded to 4 decimals (about 11 m) before it is ever stored — enough to
// find an item, without keeping a finder's exact position
// (SYSTEM_AUDIT_ROUND4.md C3).
const round4 = (n) => Math.round(n * 1e4) / 1e4;

function toLocation(pos) {
  return {
    lat: round4(pos.coords.latitude),
    lng: round4(pos.coords.longitude),
    accuracy: Math.max(Math.round(pos.coords.accuracy), 11),
  };
}

function getPosition(options) {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ location: toLocation(pos), reason: null }),
      (err) =>
        resolve({
          location: null,
          reason: err?.code === 1 ? 'denied' : err?.code === 3 ? 'timeout' : 'unavailable',
        }),
      options
    );
  });
}

// GPS first; indoors it often needs more than a few seconds, so a GPS miss
// falls back to the faster network-based fix (a recent cached one is fine).
// A denial is final — asking again won't change the answer.
export async function captureLocation() {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { location: null, reason: 'unsupported' };
  }
  const precise = await getPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  if (precise.location || precise.reason === 'denied') return precise;
  return getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}
