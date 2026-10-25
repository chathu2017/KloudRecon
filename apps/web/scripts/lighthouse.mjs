// Lighthouse on the production build (landing page by default):
//   npm run build && node scripts/lighthouse.mjs [path] [--desktop]
// Serves dist with `vite preview` (API proxied to :8000), runs the Lighthouse CLI with a local
// Chromium (CHROME_PATH, or Playwright's), prints the category scores and writes the JSON report
// to e2e/.results/lighthouse.json. Budget: Performance >= 90, Accessibility >= 95 (decision 0043).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const path = process.argv.find((a, i) => i > 1 && a.startsWith('/')) ?? '/';
const desktop = process.argv.includes('--desktop');
const port = 4180;

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux', 'chrome-linux64']) {
      const exe = join(root, d, sub, sub.startsWith('chrome-win') ? 'chrome.exe' : 'chrome');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('No Chromium found: set CHROME_PATH or run `npx playwright install chromium`');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { shell: true, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
try {
  const out = 'e2e/.results/lighthouse.json';
  const args = [
    'lighthouse', `http://localhost:${port}${path}`, '--quiet', '--output=json', `--output-path=${out}`,
    '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new',
    ...(desktop ? ['--preset=desktop'] : []),
  ];
  const res = spawnSync('npx', args, { shell: true, stdio: 'inherit', env: { ...process.env, CHROME_PATH: chrome() } });
  if (res.status !== 0) throw new Error('lighthouse failed');
  const report = JSON.parse(readFileSync(out, 'utf8'));
  for (const [k, c] of Object.entries(report.categories)) console.log(`${k.padEnd(15)} ${Math.round(c.score * 100)}`);
  for (const id of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index']) {
    const a = report.audits[id];
    console.log(`  ${id.padEnd(26)} ${a.displayValue}`);
  }
} finally {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill();
}
