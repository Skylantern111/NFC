// Non-blocking location capture. Resolves null on denial/unsupported/timeout
// so the report flow never throws a fatal error (graceful degradation).
//
// Rounded to 4 decimals (about 11 m) before it is ever stored — enough to
// find an item, without keeping a finder's exact position
// (SYSTEM_AUDIT_ROUND4.md C3).
const round4 = (n) => Math.round(n * 1e4) / 1e4;
export function captureLocation() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: round4(pos.coords.latitude),
          lng: round4(pos.coords.longitude),
          accuracy: Math.max(Math.round(pos.coords.accuracy), 11),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}
