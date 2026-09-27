// Apply the stored theme before first paint so toggling dark mode is
// instant on reload too — without this, the page would flash light
// then snap to dark once React mounts and ThemeContext's effect runs.
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
