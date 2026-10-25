import { expect, test } from '@playwright/test';
import { API } from './global-setup';
import { apiCall, apiToken, mailsTo, signIn, signOut, unique, waitForApp } from './helpers';

/** Plan 1.4: sign up → profile → pending → owner approves → welcome email → app. */
test('a new customer is approved by the owner and reaches the app', async ({ page }) => {
  const id = unique('e2e');
  const email = `${id}@fabrikam.test`;
  const company = `Fabrikam ${id}`;

  await signIn(page, email, 'Frank Fabrikam');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Full name').fill('Frank Fabrikam');
  await page.getByLabel('Job title').fill('Head of Cloud');
  await page.getByLabel('Company', { exact: true }).fill(company);
  await page.getByLabel('Country').fill('Germany');
  await page.getByLabel('Company size').click();
  await page.getByRole('option', { name: /51-200 employees/ }).click();
  await page.getByLabel('What do you want to achieve with KloudRecon?').fill('A read-only security and cost review of our Azure estate.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Your account is under review' })).toBeVisible();

  // The data API refuses a pending account.
  const blocked = await page.evaluate(async () => {
    const raw = localStorage.getItem('kr.devToken');
    const token = raw ? (JSON.parse(raw) as { token: string }).token : '';
    return (await fetch('/api/v1/overview', { headers: token ? { Authorization: `Bearer ${token}` } : {} })).status;
  });
  expect([401, 403]).toContain(blocked);

  // Owner approves from the queue.
  await signOut(page);
  await signIn(page, 'owner@local.test');
  await page.goto('/owner/approvals');
  const row = page.getByRole('row').filter({ hasText: company });
  await row.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(company);
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(row).toHaveCount(0);

  // Welcome email in Mailpit (sent by the worker).
  await expect.poll(async () => (await mailsTo(email)).map((m) => m.Subject).join('|'), { timeout: 60_000 }).toContain('approved');

  // The customer now lands in the app.
  await signOut(page);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText(company).first()).toBeVisible();
});

/** Plan 9.12 / Section 15: the org owner deletes the organization; its data is purged. */
test('an organization owner can delete the organization', async ({ page }) => {
  const id = unique('e2e-del');
  const email = `${id}@northwind.test`;
  const company = `Northwind ${id}`;
  const token = await apiToken(email);
  const onboard = await fetch(`${API}/api/v1/onboarding`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Nora Northwind',
      company,
      country: 'Norway',
      job_title: 'CTO',
      phone: '',
      company_size: '51-200',
      industry: '',
      use_case: 'Testing the organization deletion flow end to end.',
      accept_terms: true,
    }),
  });
  expect(onboard.status).toBe(201);
  const me = (await (await fetch(`${API}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } })).json()) as {
    org: { id: string };
  };
  await apiCall('owner@local.test', 'POST', `/api/v1/owner/registrations/${me.org.id}/approve`, {
    plan_code: 'starter',
    trial_days: 14,
  });

  await signIn(page, email);
  await page.goto('/app/settings/billing');
  await page.getByRole('button', { name: 'Delete organization' }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Delete permanently' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Organization name').fill(company);
  await confirm.click();
  await expect(page).toHaveURL(/\/$|\/login/);

  // the worker purges the organization
  await expect
    .poll(async () => {
      const orgs = await apiCall<{ id: string }[]>('owner@local.test', 'GET', `/api/v1/owner/orgs?q=${encodeURIComponent(company)}`);
      return orgs.length;
    }, { timeout: 60_000 })
    .toBe(0);
});

/** Plan Section 17: the public "View live demo" opens a read-only Contoso Demo session. */
test('a visitor explores the live demo read-only', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('button', { name: 'View live demo' }).first().click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText(/exploring the live demo/)).toBeVisible();
  await expect(page.getByText('KloudRecon Score').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Ask KloudRecon/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Scan now/ })).toHaveCount(0);
  await page.goto('/app/security/attack-paths');
  await expect(page.getByText(/vm-prod-jumpbox01/).first()).toBeVisible();
});
