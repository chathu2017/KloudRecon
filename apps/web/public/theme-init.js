// Applies the saved theme before first paint (no flash). External file to satisfy the CSP.
(function () {
  try {
    var t = localStorage.getItem('kr.theme') || 'system';
    var dark =
      t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    /* storage unavailable */
  }
})();
