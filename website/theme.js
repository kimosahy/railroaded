/* Railroaded — Dark/light mode toggle
   Runs immediately in <head> to prevent flash of wrong theme. */
(function () {
  function getPreferred() {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  }

  var theme = getPreferred();
  document.documentElement.setAttribute('data-theme', theme);

  function updateMeta(t) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f5f0e8' : '#0a0a0f');
  }
  updateMeta(theme);

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    function update(t) {
      btn.textContent = t === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
      btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    update(theme);

    btn.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      update(theme);
      updateMeta(theme);
    });
  });
})();
