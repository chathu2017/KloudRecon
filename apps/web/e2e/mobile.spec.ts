import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, scrollThrough, signIn, waitForApp } from './helpers';

/** Phone layout (plan 14.4: responsive; mobile is read-only). Runs in the "mobile" project. */
const PAGES = ['/app', '/app/inventory', '/app/security/findings', '/app/cost', '/app/reports', '/app/settings/billing'];

test('main pages fit a phone screen without sideways scrolling', async ({ page }) => {
  await signIn(page, 'demo@contoso.test');
  for (const path of PAGES) {
    await page.goto(path);
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect.soft(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('the navigation opens from the menu button and scan controls are hidden', async ({ page }) => {
  await signIn(page, 'demo@contoso.test');
  await page.goto('/app');
  await expect(page.getByRole('button', { name: /Scan now/ })).toBeHidden();
  await page.getByRole('button', { name: /menu|navigation/i }).first().click();
  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(page).toHaveURL(/\/app\/inventory/);
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
});

test('the public landing page fits a phone screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('h1').first().waitFor();
  await expectNoHorizontalScroll(page);
});

test('public pages fit a 375px screen in light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const path of ['/', '/pricing', '/security', '/login']) {
      await page.goto(path);
      await page.locator('h1').first().waitFor();
      await expectNoHorizontalScroll(page);
    }
  }
});

test('the landing page has no serious accessibility violations on a phone (light and dark)', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await page.locator('h1').first().waitFor();
    await waitForApp(page);
    await scrollThrough(page);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${theme}: ${v.id}`);
    expect(serious).toEqual([]);
  }
});

test('app pages have no serious accessibility violations on a phone (light and dark)', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'demo@contoso.test');
  const serious: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const path of ['/app', '/app/security/findings', '/app/cost', '/app/inventory']) {
      await page.goto(path);
      await page.locator('h1').first().waitFor();
      await page.waitForTimeout(800);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      serious.push(
        ...result.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${theme} ${path}: ${v.id} — ${v.nodes[0]?.target.join(' ') ?? ''}`),
      );
    }
  }
  expect(serious).toEqual([]);
});
