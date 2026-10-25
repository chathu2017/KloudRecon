import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/** Every module of the product on the Contoso Demo organization (Demo Mode, plan Section 17). */
test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(page, 'demo@contoso.test');
  await expect(page).toHaveURL(/\/app/);
});

test.afterAll(async () => {
  await page.close();
});

async function heading(name: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('overview: score, KPIs and the AI executive summary', async () => {
  await page.goto('/app');
  await expect(page.getByText('KloudRecon Score').first()).toBeVisible();
  await expect(page.getByText(/Executive summary/i).first()).toBeVisible();
});

test('inventory, changes and diagrams', async () => {
  await page.goto('/app/inventory');
  await heading('Inventory');
  await expect(page.getByText(/\d+ resources across/)).toBeVisible();
  await expect(page.getByText('acrcontosoprod')).toBeVisible();
  await page.goto('/app/changes');
  await heading('Changes');
  await page.goto('/app/diagrams');
  await heading('Architecture diagrams');
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });
});

test('security: findings, attack paths with the AI analyst, compliance', async () => {
  await page.goto('/app/security/findings');
  await heading('Findings');
  await expect(page.getByText(/Critical/).first()).toBeVisible();
  await page.goto('/app/security/attack-paths');
  await heading('Attack paths');
  await expect(page.getByText(/vm-prod-jumpbox01/).first()).toBeVisible();
  await expect(page.getByText('AI Security Analyst')).toBeVisible();
  await page.goto('/app/security/compliance');
  await heading('Compliance');
});

test('cost, recommendations, reliability and governance', async () => {
  await page.goto('/app/cost');
  await heading('Cost & FinOps');
  await expect(page.getByText('Daily cost by service')).toBeVisible();
  await expect(page.getByText('Total (actual)')).toBeVisible();
  await page.goto('/app/recommendations');
  await heading(/Recommendations/);
  await page.goto('/app/reliability');
  await heading(/Reliability/);
  await page.goto('/app/governance');
  await heading('Governance');
});

test('Ask KloudRecon answers from scan data with citations', async () => {
  await page.goto('/app');
  await page.getByRole('button', { name: /Ask KloudRecon/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('textbox').fill('What are my top risks?');
  await panel.getByRole('textbox').press('Enter');
  const answer = panel.locator('a[href^="/app/security/findings/"]').first();
  await expect(answer).toBeVisible({ timeout: 45_000 });
  await page.keyboard.press('Escape');
});

test('reports: an executive one-pager renders to PDF and downloads', async () => {
  await page.goto('/app/reports');
  await heading('Reports');
  const rows = page.getByRole('row');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  await page.getByRole('button', { name: /Executive one-pager/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Generate' }).click();
  await expect(rows).toHaveCount(before + (before === 0 ? 2 : 1));
  const newest = rows.nth(1);
  await expect(newest).toContainText('Ready', { timeout: 90_000 });
  const download = page.waitForEvent('download');
  await newest.getByRole('button', { name: /^Download / }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
});

test('settings: alerts, billing, AI and branding', async () => {
  await page.goto('/app/settings/alerts');
  await heading('Alerts');
  await expect(page.getByRole('cell', { name: 'Critical risks', exact: true })).toBeVisible();
  await page.goto('/app/settings/billing');
  await heading('Billing & plan');
  await expect(page.getByText('Plans', { exact: true })).toBeVisible();
  await page.goto('/app/settings/ai');
  await heading('AI');
  await page.goto('/app/settings/branding');
  await heading(/branding/i);
});
