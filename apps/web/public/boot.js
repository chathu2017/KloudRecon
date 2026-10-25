// Loads the app bundle after the page has painted on prerendered public pages (decision 0043).
// The page is already complete as static HTML (scripts/prerender.mjs) and its links work without
// JavaScript, so the bundle starts only once the first contentful paint has happened and the
// window has loaded (hero image, fonts). That keeps ~300 KB of JavaScript from competing with
// what the visitor sees first. External file (not inline) to satisfy the CSP; `data-entry` is
// set by the prerender step.
(function () {
  var self = document.currentScript;
  var entry = self && self.getAttribute('data-entry');
  if (!entry) return;
  var started = false;
  function load() {
    if (started) return;
    started = true;
    var s = document.createElement('script');
    s.type = 'module';
    s.crossOrigin = '';
    s.src = entry;
    document.head.appendChild(s);
  }
  var painted = false;
  var loaded = document.readyState === 'complete';
  function maybe() {
    if (painted && loaded) requestAnimationFrame(function () { setTimeout(load, 0); });
  }
  try {
    if (performance.getEntriesByName('first-contentful-paint').length) painted = true;
    else
      new PerformanceObserver(function (list, observer) {
        if (list.getEntriesByName('first-contentful-paint').length) {
          painted = true;
          observer.disconnect();
          maybe();
        }
      }).observe({ type: 'paint', buffered: true });
  } catch (e) {
    painted = true; // no Paint Timing API: fall back to the load event alone
  }
  if (!loaded)
    window.addEventListener('load', function () {
      loaded = true;
      maybe();
    });
  maybe();
  // never leave the page without its app for long (e.g. a paint entry that never arrives)
  setTimeout(load, 4000);
})();
