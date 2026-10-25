import { expect, test, type Page } from '@playwright/test';
import { signIn, signOut } from './helpers';

/**
 * Layout guards for every route (decision 0044): no broken images, and no sideways scrolling at
 * 375 / 768 / 1024 / 1440 / 1920 px. Each page is loaded once and then resized through the
 * widths (the layout is responsive CSS, so a resize shows the same result as a fresh load).
 */
const WIDTHS = [375, 768, 1024, 1440, 1920];

const PUBLIC = ['/', '/pricing', '/security', '/terms', '/privacy', '/login', '/signup', '/does-not-exist'];

const APP = [
  '/app',
  '/app/inventory',
  '/app/changes',
  '/app/changes/compare',
  '/app/diagrams',
  '/app/diagrams/document',
  '/app/security/findings',
  '@/app/security/findings/',
  '/app/security/exceptions',
  '/app/security/attack-paths',
  '/app/security/exposure',
  '/app/security/identity',
  '/app/security/vulnerabilities',
  '/app/server-health',
  '/app/security/threats',
  '/app/security/coverage',
  '/app/security/compliance',
  '@/app/security/compliance/',
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
  '@/app/settings/connections/',
  '/app/settings/team',
  '/app/settings/profile',
  '/app/settings/audit',
  '/app/notifications',
];

const OWNER = [
  '/owner',
  '/owner/approvals',
  '/owner/orgs',
  '@/owner/orgs/',
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

/** "@/list/" means: the first detail link under that list page. */
async function resolve(page: Page, entry: string): Promise<string | null> {
  if (!entry.startsWith('@')) return entry;
  const prefix = entry.slice(1);
  await page.goto(prefix.replace(/\/$/, ''));
  await page.locator('h1').first().waitFor();
  await page.waitForTimeout(1200);
  const hrefs = await page.locator(`a[href^="${prefix}"]`).evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  return hrefs.find((h) => /^[^/?#]+$/.test(h.slice(prefix.length)) && !h.endsWith('/new')) ?? null;
}

async function check(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  await page.locator('h1').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
  // load lazy images, then look for broken ones
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(height, 10_000); y += 900) await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0 && getComputedStyle(img).display !== 'none')
      .map((img) => img.getAttribute('src') ?? '?'),
  );
  for (const src of broken) problems.push(`${path}: broken image ${src}`);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`${path} @${width}px: scrolls sideways by ${overflow}px`);
  }
  return problems;
}

test.setTimeout(600_000);

test('public pages: no broken images, no sideways scrolling at any width', async ({ page }) => {
  const problems: string[] = [];
  for (const path of PUBLIC) problems.push(...(await check(page, path)));
  expect(problems).toEqual([]);
});

test('customer app pages: no broken images, no sideways scrolling at any width', async ({ page }) => {
  await signIn(page, 'demo@contoso.test');
  const problems: string[] = [];
  for (const entry of APP) {
    const path = await resolve(page, entry);
    if (path) problems.push(...(await check(page, path)));
    else problems.push(`${entry}: no detail link found`);
  }
  expect(problems).toEqual([]);
});

test('owner console pages: no broken images, no sideways scrolling at any width', async ({ page }) => {
  await signIn(page, 'owner@local.test');
  const problems: string[] = [];
  for (const entry of OWNER) {
    const path = await resolve(page, entry);
    if (path) problems.push(...(await check(page, path)));
    else problems.push(`${entry}: no detail link found`);
  }
  await signOut(page);
  expect(problems).toEqual([]);
});
