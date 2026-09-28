// Apply the stored theme before first paint so toggling dark mode is
// instant on reload too — without this, the page would flash light
// then snap to dark once React mounts and ThemeContext's effect runs.
// Also sets the browser-bar color to match (UI_UX_IMPROVEMENT_PLAN.md DS14).
(function () {
  var dark = false;
  try {
    dark = localStorage.getItem('theme') === 'dark';
  } catch (e) {}
  if (dark) document.documentElement.classList.add('dark');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0D0A1A' : '#E9EDF5');
})();
