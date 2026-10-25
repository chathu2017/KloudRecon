import { expect, type Page } from '@playwright/test';
import { API } from './global-setup';

/** Dev sign-in through the real login page (AUTH_MODE=dev). */
export async function signIn(page: Page, email: string, name = ''): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  if (name) await page.getByLabel('Display name (optional)').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export async function signOut(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

/** A bearer token for API-side arrangement (dev login). */
export async function apiToken(email: string): Promise<string> {
  const resp = await fetch(`${API}/api/v1/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body = (await resp.json()) as { access_token: string };
  return body.access_token;
}

export async function apiCall<T>(email: string, method: string, path: string, body?: unknown): Promise<T> {
  const token = await apiToken(email);
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${method} ${path} → ${resp.status} ${await resp.text()}`);
  return (await resp.json()) as T;
}

/** Messages caught by Mailpit (http://localhost:8025) for one recipient. */
export async function mailsTo(address: string): Promise<{ Subject: string }[]> {
  const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
  const resp = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  if (!resp.ok) return [];
  const body = (await resp.json()) as { messages?: { Subject: string }[] };
  return body.messages ?? [];
}

/** The page never scrolls sideways (mobile layout check). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * Public pages are prerendered static HTML that React hydrates after the first paint
 * (decision 0043); wait for that before clicking buttons that need JavaScript.
 */
export async function waitForApp(page: Page): Promise<void> {
  await page.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 30_000 });
}

/** Scroll through the page once so lazy images load and scroll reveals run. */
export async function scrollThrough(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
}
