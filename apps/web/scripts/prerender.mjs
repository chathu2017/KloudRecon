// Prerenders the public marketing pages into static HTML after `vite build` (decision 0043).
//
// Why: the SPA paints nothing until its JavaScript has loaded, which keeps the landing page's
// first paint around 3 s on a throttled mobile connection. The snapshot is the app's own markup,
// taken with headless Chromium from the built bundle, so no server rendering code exists. At load
// the browser paints this HTML immediately; React then hydrates it (src/main.tsx), reusing the DOM.
//
// Output: dist/index.html (landing), dist/pricing/index.html, dist/security/index.html, and
// dist/app.html: the untouched SPA shell, used as the navigation fallback for every other route
// (public/staticwebapp.config.json), so app pages never flash marketing markup.
//
// Needs Chromium (`npx playwright install chromium`). Without it the step is skipped with a
// warning, unless PRERENDER=required (deploy workflow), where it fails the build.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROUTES = ['/', '/pricing', '/security'];
const PORT = 4191;
const required = process.env.PRERENDER === 'required';
const dist = 'dist';

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch {
  finish('Playwright is not installed');
}

const shell = readFileSync(join(dist, 'index.html'), 'utf8');
copyFileSync(join(dist, 'index.html'), join(dist, 'app.html'));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: true,
  stdio: 'ignore',
});
let browser;
const written = [];
try {
  await waitFor(`http://localhost:${PORT}/app.html`);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Hold API calls open: the snapshot is the page's loading state, which is exactly what the
  // client renders first, so React can hydrate it (src/main.tsx) instead of replacing it.
  await page.route('**/api/**', () => {});
  // Snapshot every route from the untouched shell first; files are written only at the end, so
  // no route is ever served an already prerendered page as its fallback.
  const outputs = [];
  for (const route of ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'load' });
    await page.locator('h1').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);
    const markup = await page.evaluate(() => {
      const root = document.getElementById('root');
      if (!root) throw new Error('#root missing');
      const clone = root.cloneNode(true);
      // runtime-only state added outside React (scroll reveals)
      clone.querySelectorAll('.js-reveal').forEach((el) => el.classList.remove('js-reveal'));
      clone.querySelectorAll('.is-visible').forEach((el) => el.classList.remove('is-visible'));
      // menus render a plain trigger until hydrated (useHydrated): drop their generated wiring
      clone.querySelectorAll('[id^="radix-"]').forEach((el) => {
        for (const a of ['id', 'type', 'aria-controls', 'aria-haspopup', 'aria-expanded', 'data-state']) el.removeAttribute(a);
      });
      // React renders `Step {n}: ` as separate text nodes; serialized HTML would merge them and
      // hydration would find fewer nodes than it expects. Separate them the way React's server
      // renderer does, with an empty comment.
      const separate = (node) => {
        let previousWasText = false;
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE) {
            if (previousWasText) node.insertBefore(document.createComment(' '), child);
            previousWasText = true;
          } else {
            previousWasText = false;
            if (child.nodeType === Node.ELEMENT_NODE) separate(child);
          }
        }
      };
      separate(clone);
      // PublicLayout's <Suspense> around the page: React hydrates a boundary only between its
      // server markers (<!--$--> ... <!--/$-->), so add them as React's server renderer would.
      const page = clone.querySelector('main[data-page-root]');
      if (!page) throw new Error('main[data-page-root] not found (PublicLayout)');
      page.insertBefore(document.createComment('$'), page.firstChild);
      page.appendChild(document.createComment('/$'));
      return clone.innerHTML;
    });
    let html = shell.replace('<div id="root"></div>', `<div id="root" data-prerendered="${route}">${markup}</div>`);
    if (html === shell) throw new Error('could not find <div id="root"></div> in dist/index.html');
    html = deferApp(html);
    const file = route === '/' ? join(dist, 'index.html') : join(dist, route.slice(1), 'index.html');
    outputs.push({ route, file, html, kb: Math.round(markup.length / 1024) });
  }
  for (const { route, file, html, kb } of outputs) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    written.push(file);
    console.log(`prerendered ${route} -> ${file} (${kb} KB)`);
  }

  // Verify: every page must hydrate without errors (a mismatch would fall into the router's
  // error screen). API calls stay held so the check does not depend on a running backend.
  const check = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await check.route('**/api/**', () => {});
  for (const { route } of outputs) {
    const errors = [];
    const onConsole = (m) => {
      if (m.type() === 'error') errors.push(m.text());
    };
    const onError = (e) => errors.push(e.message);
    check.on('console', onConsole);
    check.on('pageerror', onError);
    await check.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'load' });
    // boot.js starts the app after the first paint and the load event
    await check.waitForFunction(() => document.documentElement.classList.contains('no-intro'), null, { timeout: 15_000 });
    await check.waitForTimeout(1500);
    check.off('console', onConsole);
    check.off('pageerror', onError);
    const broken = errors.filter((e) => /hydrat|Minified React error #4(18|19|20|21|22|23|25)|Unexpected Application Error/i.test(e));
    if (process.env.PRERENDER_DEBUG) console.log(errors.map((e) => e.split('\n').slice(0, 4).join(' | ')).join('\n'));
    if (broken.length) throw new Error(`${route} did not hydrate cleanly: ${broken[0].slice(0, 300)}`);
    if (!(await check.locator('h1').first().isVisible())) throw new Error(`${route} lost its heading after hydration`);
    console.log(`verified ${route} hydrates cleanly`);
  }
} catch (err) {
  // restore the plain shell so a partial or broken prerender never ships
  for (const file of written) rmSync(file, { force: true });
  writeFileSync(join(dist, 'index.html'), shell);
  finish(err instanceof Error ? err.message : String(err));
} finally {
  await browser?.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill();
}

/**
 * The page is complete as static HTML, so the app bundle can start after the first paint:
 * drop the modulepreload hints and load the entry through /boot.js (public/boot.js).
 */
function deferApp(html) {
  const entry = /<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(html);
  if (!entry) throw new Error('entry <script type="module"> not found in index.html');
  return html
    .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
    .replace(entry[0], `<script defer src="/boot.js" data-entry="${entry[1]}"></script>`);
}

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not start at ${url}`);
}

function finish(reason) {
  const message = `prerender skipped: ${reason}`;
  if (required) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message} (the site still works; the landing page just paints later)`);
  process.exit(0);
}
