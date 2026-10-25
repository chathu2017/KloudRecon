import { expect, test } from '@playwright/test';

/** Self-hosted fonts (decisions 0041, 0044): no third-party font requests and no layout shift. */
test('fonts load from our origin without shifting the layout', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fonts.push(r.url());
  });
  await page.goto('/');
  await page.locator('h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const loaded = await page.evaluate(
    () =>
      document.fonts.check('500 16px "Manrope"') && document.fonts.check('400 16px "Manrope"'),
  );
  expect(loaded).toBe(true);
  const base = new URL(page.url()).origin;
  expect(fonts.filter((u) => !u.startsWith(`${base}/fonts/`))).toEqual([]);

  const shift = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!e.hadRecentInput) total += e.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(total), 300);
      }),
  );
  expect(shift).toBeLessThan(0.05);
});
