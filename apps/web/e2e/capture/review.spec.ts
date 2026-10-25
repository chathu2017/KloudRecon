import { test, type Page } from '@playwright/test';
import { signIn } from '../helpers';

/**
 * Quick design-review shots while iterating (not committed output):
 *   REVIEW_OUT=<dir> REVIEW_PAGES=/app,/ UI_CAPTURE=1 npx playwright test e2e/capture/review.spec.ts --project=capture
 */
const OUT = process.env.REVIEW_OUT ?? 'e2e/.results/review';
const PAGES = (process.env.REVIEW_PAGES ?? '/,/app').split(',');
const USER = process.env.REVIEW_USER ?? 'demo@contoso.test';

async function settle(page: Page) {
  await page.locator('h1').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1600);
}

/** Scroll through once so lazy images load and scroll reveals run before a full-page shot. */
async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
}

for (const [theme, width] of [['light', 1440], ['dark', 1440], ['light', 375]] as const) {
  test(`review ${theme} ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    if (PAGES.some((p) => p.startsWith('/app') || p.startsWith('/owner'))) await signIn(page, USER);
    for (const path of PAGES) {
      await page.goto(path);
      await settle(page);
      if (process.env.REVIEW_FULL === '1') await scrollThrough(page);
      const name = path === '/' ? 'landing' : path.replace(/^\//, '').replace(/[/?=&]/g, '_');
      await page.screenshot({ path: `${OUT}/${name}-${theme}-${width}.png`, fullPage: process.env.REVIEW_FULL === '1' });
    }
  });
}
