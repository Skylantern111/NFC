// Light-only after the brutalist redesign. Kept as a separate file (not
// inline) so the Content-Security-Policy in firebase.json can stay
// script-src 'self'. Just pins the browser-bar color to the paper canvas and
// clears any stale dark-mode preference from the old dual-theme system.
(function () {
  try {
    document.documentElement.classList.remove('dark');
    if (localStorage.getItem('theme')) localStorage.removeItem('theme');
  } catch (e) {}
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#FDFBF7');
})();
