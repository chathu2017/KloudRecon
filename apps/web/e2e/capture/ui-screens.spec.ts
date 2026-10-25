import { expect, test, type Page } from '@playwright/test';
import { signIn } from '../helpers';

/**
 * UI screenshot set for design reviews (not part of `npm run e2e`):
 *   UI_CAPTURE=docs/ui/after npx playwright test e2e/capture --project=capture
 * Needs the stack running with the demo seeded.
 */
const OUT = process.env.UI_CAPTURE ?? '../../docs/ui/after';

const APP = [
  ['app-overview', '/app'],
  ['app-findings', '/app/security/findings'],
  ['app-cost', '/app/cost'],
  ['app-diagrams', '/app/diagrams'],
  ['app-reports', '/app/reports'],
] as const;

async function settle(page: Page) {
  await page.locator('h1').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

/** Scroll through the page so lazy images load before a full-page screenshot. */
async function loadAll(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

for (const theme of ['light', 'dark'] as const) {
  for (const mobile of [false, true]) {
    const tag = mobile ? `${theme}-375` : theme;
    if (mobile && theme === 'dark') continue; // mobile set in light only
    test(`screens ${tag}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const shot = (name: string, fullPage = false) => page.screenshot({ path: `${OUT}/${name}-${tag}.png`, fullPage });

      await page.goto('/');
      await settle(page);
      await loadAll(page);
      await shot('landing', true);
      await page.goto('/pricing');
      await settle(page);
      await shot('pricing', true);

      await signIn(page, 'demo@contoso.test');
      for (const [name, path] of APP) {
        await page.goto(path);
        await settle(page);
        if (name === 'app-diagrams') await page.locator('.react-flow__node').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
        await shot(name);
      }
      await page.goto('/app');
      await settle(page);
      const ask = page.getByRole('button', { name: /Ask KloudRecon/ });
      if (await ask.isVisible()) {
        await ask.click();
        const panel = page.getByRole('dialog');
        await panel.getByRole('textbox').fill('What are my top risks?');
        await panel.getByRole('textbox').press('Enter');
        await expect(panel.locator('a[href^="/app/security/findings/"]').first()).toBeVisible({ timeout: 45_000 });
        await page.waitForTimeout(500);
        await shot('app-chat');
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => localStorage.clear());
      await signIn(page, 'owner@local.test');
      await page.goto('/owner');
      await settle(page);
      await shot('owner-overview');
      await page.goto('/owner/health');
      await settle(page);
      await shot('owner-health');
    });
  }
}
