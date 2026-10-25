import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { scrollThrough, signIn, waitForApp } from './helpers';

/** WCAG 2.1 AA checks (axe-core) on the main pages, light and dark (plan 14.4). */
const CUSTOMER_PAGES = [
  '/app',
  '/app/inventory',
  '/app/diagrams',
  '/app/server-health',
  '/app/security/findings',
  '/app/security/attack-paths',
  '/app/security/compliance',
  '/app/cost',
  '/app/recommendations',
  '/app/reports',
  '/app/settings/alerts',
  '/app/settings/billing',
];
const OWNER_PAGES = ['/owner', '/owner/approvals', '/owner/health', '/owner/business', '/owner/email-templates'];
const PUBLIC_PAGES = ['/', '/pricing', '/security', '/login'];

async function audit(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  // (no networkidle: the live-events stream stays open)
  await page.locator('h1').first().waitFor();
  await page.waitForTimeout(800); // data and charts settle
  if (PUBLIC_PAGES.includes(path)) {
    // prerendered pages hydrate after the first paint; scroll so every revealed section is audited
    await waitForApp(page);
    await scrollThrough(page);
  }
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // the diagram canvas is an interactive graphic with its own keyboard model and text alternative
    .exclude('.react-flow__renderer')
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${path}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(' ') ?? ''}`);
}

test.setTimeout(240_000);

for (const theme of ['light', 'dark'] as const) {
  test(`public and customer pages have no serious violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const problems: string[] = [];
    for (const path of PUBLIC_PAGES) problems.push(...(await audit(page, path)));
    await signIn(page, 'demo@contoso.test');
    for (const path of CUSTOMER_PAGES) problems.push(...(await audit(page, path)));
    expect(problems).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`owner console has no serious violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page, 'owner@local.test');
    const problems: string[] = [];
    for (const path of OWNER_PAGES) problems.push(...(await audit(page, path)));
    expect(problems).toEqual([]);
  });
}
