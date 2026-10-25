import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { apiCall, signIn, signOut, unique } from './helpers';

test.describe.configure({ mode: 'serial' });

/** A local HTTP endpoint standing in for a customer's webhook receiver. */
interface Received {
  headers: IncomingMessage['headers'];
  body: string;
}
let server: Server;
const received: Received[] = [];
const PORT = 9123;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('alerts reach a signed webhook and the delivery log', async ({ page }) => {
  await signIn(page, 'demo@contoso.test');
  await page.goto('/app/settings/alerts');
  await page.getByRole('tab', { name: 'Channels' }).click();
  await page.getByRole('button', { name: 'Add channel' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type').selectOption('webhook');
  const name = unique('ops-hook');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Webhook URL').fill(`http://localhost:${PORT}/hook`);
  await dialog.getByRole('button', { name: 'Add channel' }).click();
  const secret = await dialog.getByRole('textbox', { name: 'Signing secret' }).inputValue();
  expect(secret).toMatch(/^whsec_/);
  await dialog.getByRole('button', { name: 'Done' }).click();

  const row = page.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: /Test/ }).click();
  await expect(row.getByText('Delivered')).toBeVisible();
  const hit = received.at(-1);
  expect(hit).toBeDefined();
  const signature = String(hit?.headers['x-kloudrecon-signature'] ?? '');
  const [t, v1] = signature.split(',').map((p) => p.split('=')[1] ?? '');
  expect(createHmac('sha256', secret).update(`${t}.${hit?.body ?? ''}`).digest('hex')).toBe(v1);

  await page.getByRole('tab', { name: 'Delivery log' }).click();
  await expect(page.getByText('Test alert from KloudRecon').first()).toBeVisible();

  // clean up the channel
  await page.getByRole('tab', { name: 'Channels' }).click();
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: `Delete ${name}` }).click();
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
});

test('plan limits: Starter cannot add webhook channels', async ({ page }) => {
  await signIn(page, 'admin@acme.test');
  await page.goto('/app/settings/alerts');
  await page.getByRole('tab', { name: 'Channels' }).click();
  await expect(page.getByText('Available on Pro and Enterprise')).toBeVisible();
  const resp = await apiCall<{ error?: unknown }>('admin@acme.test', 'GET', '/api/v1/billing');
  expect(resp).toMatchObject({ plan_code: 'starter' });
});

test('owner: announcement banner, health and business pages', async ({ page }) => {
  const title = unique('Maintenance window');
  await signIn(page, 'owner@local.test');
  await page.goto('/owner/announcements');
  await page.getByRole('button', { name: 'New announcement' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Level').selectOption('warning');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(title)).toBeVisible();

  await page.goto('/owner/health');
  await expect(page.getByRole('heading', { level: 1, name: 'System health' })).toBeVisible();
  await expect(page.getByText('Queued jobs')).toBeVisible();
  await page.goto('/owner/business');
  await expect(page.getByRole('heading', { level: 1, name: 'Business' })).toBeVisible();
  await expect(page.getByText('Revenue by plan')).toBeVisible();

  try {
    await signOut(page);
    await signIn(page, 'demo@contoso.test');
    const banner = page.getByRole('alert').filter({ hasText: title });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: /Dismiss/ }).click();
    await expect(banner).toHaveCount(0);
  } finally {
    const list = await apiCall<{ id: string; title: string }[]>('owner@local.test', 'GET', '/api/v1/owner/announcements');
    for (const a of list.filter((x) => x.title === title)) {
      await apiCall('owner@local.test', 'DELETE', `/api/v1/owner/announcements/${a.id}`);
    }
  }
});

test('owner: read-only view of a customer organization', async ({ page }) => {
  await signIn(page, 'owner@local.test');
  const orgs = await apiCall<{ id: string; name: string }[]>('owner@local.test', 'GET', '/api/v1/owner/orgs?status=active');
  const contoso = orgs.find((o) => o.name === 'Contoso Demo');
  expect(contoso).toBeDefined();
  await page.goto(`/owner/orgs/${contoso?.id ?? ''}`);
  await page.getByRole('button', { name: 'View as organization' }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText(/Read-only view of Contoso Demo/)).toBeVisible();
  await expect(page.getByText('KloudRecon Score').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Ask KloudRecon/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit view' }).click();
  await expect(page).toHaveURL(/\/owner\/orgs\//);
  // the visit is audited
  const logs = await apiCall<{ action: string }[]>('owner@local.test', 'GET', '/api/v1/owner/audit-logs?action=org.viewed_as_owner');
  expect(logs.length).toBeGreaterThan(0);
});

test('owner: the ai_chat feature flag hides Ask KloudRecon', async ({ page }) => {
  await apiCall('owner@local.test', 'PUT', '/api/v1/owner/feature-flags', { key: 'ai_chat', description: 'Ask KloudRecon chat for customers', enabled: false });
  try {
    await signIn(page, 'demo@contoso.test');
    await expect(page.getByText('KloudRecon Score').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Ask KloudRecon/ })).toHaveCount(0);
  } finally {
    await apiCall('owner@local.test', 'PUT', '/api/v1/owner/feature-flags', { key: 'ai_chat', description: 'Ask KloudRecon chat for customers', enabled: true });
  }
});
