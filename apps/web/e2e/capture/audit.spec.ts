import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { signIn, signOut } from '../helpers';

/**
 * Full UI audit capture (decision 0044): every route at 375 / 768 / 1024 / 1440 / 1920 px in light
 * and dark, plus modals, drawers, chat and account states. Saves JPEG screenshots and a JSON
 * report of horizontal overflow, broken images and console errors per page.
 *
 *   UI_CAPTURE=1 AUDIT_OUT=../../docs/ui/audit/before npx playwright test e2e/capture/audit.spec.ts --project=capture
 *
 * AUDIT_WIDTHS / AUDIT_THEMES / AUDIT_GROUPS narrow the run (comma lists).
 * Needs the stack running with `seed-dev` and `seed-demo`.
 */
const OUT = process.env.AUDIT_OUT ?? 'e2e/.results/audit';
const WIDTHS = (process.env.AUDIT_WIDTHS ?? '375,768,1024,1440,1920').split(',').map(Number);
const THEMES = (process.env.AUDIT_THEMES ?? 'light,dark').split(',') as ('light' | 'dark')[];
const GROUPS = (process.env.AUDIT_GROUPS ?? 'public,account,app,owner,overlays').split(',');

const PUBLIC = ['/', '/pricing', '/security', '/terms', '/privacy', '/login', '/signup', '/does-not-exist'];

const APP = [
  '/app',
  '/app/inventory',
  '/app/changes',
  '/app/changes/compare',
  '/app/diagrams',
  '/app/diagrams/document',
  '/app/security/findings',
  '@finding',
  '/app/security/exceptions',
  '/app/security/attack-paths',
  '/app/security/exposure',
  '/app/security/identity',
  '/app/security/vulnerabilities',
  '/app/security/threats',
  '/app/security/coverage',
  '/app/security/compliance',
  '@framework',
  '/app/reliability',
  '/app/governance',
  '/app/cost',
  '/app/cost/forecast',
  '/app/cost/anomalies',
  '/app/cost/rightsizing',
  '/app/cost/waste',
  '/app/cost/commitments',
  '/app/cost/whatif',
  '/app/cost/showback',
  '/app/cost/savings',
  '/app/recommendations',
  '/app/reports',
  '/app/settings/governance',
  '/app/settings/ai',
  '/app/settings/branding',
  '/app/settings/alerts',
  '/app/settings/billing',
  '/app/settings/custom-rules',
  '/app/settings/connections',
  '/app/settings/connections/new',
  '@connection',
  '/app/settings/team',
  '/app/settings/profile',
  '/app/settings/audit',
  '/app/notifications',
];

const OWNER = [
  '/owner',
  '/owner/approvals',
  '/owner/orgs',
  '@org',
  '/owner/users',
  '/owner/plans',
  '/owner/business',
  '/owner/health',
  '/owner/announcements',
  '/owner/feature-flags',
  '/owner/email-templates',
  '/owner/retirements',
  '/owner/audit',
  '/owner/notifications',
  '/owner/profile',
];

interface PageReport {
  page: string;
  width: number;
  theme: string;
  overflow: number;
  offenders: string[];
  brokenImages: string[];
  consoleErrors: string[];
}

const report: PageReport[] = [];

function slug(p: string): string {
  return p === '/' ? 'landing' : p.replace(/^\//, '').replace(/[/?=&:@]/g, '_') || 'root';
}

async function settle(page: Page) {
  await page.locator('h1, [role="dialog"]').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  // no networkidle: the live-events stream (SSE) keeps a request open
  await page.locator('.skeleton').first().waitFor({ state: 'detached', timeout: 6_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(height, 12_000); y += 900) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function inspect(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      // ignore content inside a horizontal scroller (tables, code) and fixed off-canvas panels
      let clipped = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' || s.overflowX === 'clip') {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const parent = el.parentElement?.getBoundingClientRect();
      if (parent && parent.right > vw + 1) continue;
      offenders.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 80)} right=${Math.round(r.right)}`);
    }
    const brokenImages = Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0 && getComputedStyle(img).display !== 'none')
      .map((img) => img.getAttribute('src') ?? '?');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      offenders: offenders.slice(0, 8),
      brokenImages,
    };
  });
}

/** Resolve the "@name" placeholders to a real detail page by reading the first link on a list. */
async function resolve(page: Page, p: string): Promise<string | null> {
  const lists: Record<string, [string, RegExp]> = {
    '@finding': ['/app/security/findings', /^\/app\/security\/findings\/[^/?]+$/],
    '@framework': ['/app/security/compliance', /^\/app\/security\/compliance\/[^/?]+$/],
    '@connection': ['/app/settings/connections', /^\/app\/settings\/connections\/(?!new)[^/?]+$/],
    '@org': ['/owner/orgs', /^\/owner\/orgs\/[^/?]+$/],
  };
  const entry = lists[p];
  if (!entry) return p;
  await page.goto(entry[0]);
  await settle(page);
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  return hrefs.find((h) => entry[1].test(h)) ?? null;
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`audit ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(1_800_000);
      const dir = path.join(OUT, `${width}-${theme}`);
      fs.mkdirSync(dir, { recursive: true });
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 200));
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

      const capture = async (name: string, full = true) => {
        errors.length = 0;
        const found = await inspect(page);
        await page.screenshot({ path: path.join(dir, `${name}.jpg`), fullPage: full, type: 'jpeg', quality: 55 });
        report.push({ page: name, width, theme, ...found, consoleErrors: [...errors] });
      };

      const visit = async (p: string, name = slug(p)) => {
        await page.goto(p);
        await settle(page);
        await scrollThrough(page);
        await capture(name);
      };

      if (GROUPS.includes('public')) {
        for (const p of PUBLIC) await visit(p);
      }

      if (GROUPS.includes('account')) {
        await signIn(page, `audit-${theme}-${width}-${Date.now().toString(36)}@new.test`);
        await settle(page);
        await capture('account-onboarding');
        await signOut(page);
        await signIn(page, 'pending@new.test');
        await settle(page);
        await capture('account-under-review');
        await signOut(page);
        await signIn(page, 'admin@acme.test');
        await page.goto('/app');
        await settle(page);
        await capture('account-admin-overview');
        await page.goto('/app/inventory');
        await settle(page);
        await capture('account-admin-inventory');
        await signOut(page);
      }

      if (GROUPS.includes('app') || GROUPS.includes('overlays')) {
        await signIn(page, 'demo@contoso.test');
      }
      if (GROUPS.includes('app')) {
        for (const raw of APP) {
          const p = await resolve(page, raw);
          if (!p) continue;
          await visit(p, raw.startsWith('@') ? `app-detail-${raw.slice(1)}` : slug(p));
        }
      }

      if (GROUPS.includes('overlays')) {
        // command palette
        await page.goto('/app');
        await settle(page);
        await page.keyboard.press('Control+k');
        await page.waitForTimeout(500);
        await capture('overlay-command-palette', false);
        await page.keyboard.press('Escape');
        // resource drawer
        await page.goto('/app/inventory');
        await settle(page);
        const row = page.locator('[data-resource-row], [role="row"]').nth(1);
        if (await row.isVisible().catch(() => false)) {
          await row.click();
          await page.waitForTimeout(900);
          await capture('overlay-resource-drawer', false);
          await page.keyboard.press('Escape');
        }
        // AI chat
        await page.goto('/app');
        await settle(page);
        const ask = page.getByRole('button', { name: /Ask KloudRecon/ }).first();
        if (await ask.isVisible().catch(() => false)) {
          await ask.click();
          const panel = page.getByRole('dialog');
          await panel.getByRole('textbox').fill('What are my top risks?');
          await panel.getByRole('textbox').press('Enter');
          await panel.locator('a[href^="/app/security/findings/"]').first().waitFor({ timeout: 45_000 }).catch(() => undefined);
          await page.waitForTimeout(500);
          await capture('overlay-chat', false);
          await page.keyboard.press('Escape');
        }
        // mobile navigation drawer
        const menu = page.getByRole('button', { name: /open (navigation|menu)/i }).first();
        if (await menu.isVisible().catch(() => false)) {
          await menu.click();
          await page.waitForTimeout(500);
          await capture('overlay-mobile-nav', false);
          await page.keyboard.press('Escape');
        }
        // user menu
        await signOut(page);
      }

      if (GROUPS.includes('owner')) {
        await signIn(page, 'owner@local.test');
        for (const raw of OWNER) {
          const p = await resolve(page, raw);
          if (!p) continue;
          await visit(p, raw.startsWith('@') ? `owner-detail-${raw.slice(1)}` : slug(p));
        }
        await signOut(page);
      }

      if (GROUPS.includes('public')) {
        // public live demo (read-only demo session)
        await page.goto('/');
        await page.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 30_000 }).catch(() => undefined);
        const demo = page.getByRole('button', { name: /View live demo/ }).first();
        if (await demo.isVisible().catch(() => false)) {
          await demo.click();
          await page.waitForURL(/\/app/, { timeout: 30_000 }).catch(() => undefined);
          await settle(page);
          await capture('public-demo-overview');
          await signOut(page);
        }
      }

      fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report.filter((r) => r.width === width && r.theme === theme), null, 1));
    });
  }
}
