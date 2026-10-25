import { test } from '@playwright/test';
import { signIn } from '../helpers';

/** Lists elements wider than a 375px viewport (debug aid): UI_CAPTURE=1 OVERFLOW_PAGES=/app ... */
test('overflow report', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  const pages = (process.env.OVERFLOW_PAGES ?? '/app').split(',');
  if (pages.some((p) => p.startsWith('/app') || p.startsWith('/owner'))) await signIn(page, process.env.OVERFLOW_USER ?? 'demo@contoso.test');
  for (const path of pages) {
    await page.goto(path);
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(1500);
    const found = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.width > 0) {
          const parent = el.parentElement?.getBoundingClientRect();
          if (parent && parent.right > vw + 1) continue; // report the outermost only
          out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 90)} right=${Math.round(r.right)}`);
        }
      }
      return { scroll: document.documentElement.scrollWidth, out: out.slice(0, 15) };
    });
    console.log(path, JSON.stringify(found, null, 1));
  }
});
