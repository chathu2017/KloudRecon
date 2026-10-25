import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { BillingBanner } from './BillingBanner';
import { BillingPage } from './BillingPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const me = { ...baseMe, state: 'active', user: { id: 'u1', org_role: 'owner' }, org: { id: 'o1', name: 'Acme' } };

const plan = (code: string, name: string, price: string | null, current = false) => ({
  code,
  name,
  description: `For ${name.toLowerCase()} teams.`,
  price_monthly: price,
  currency: 'USD',
  limits: { connections: code === 'pro' ? 5 : 1, ai_messages: null },
  features: code === 'pro' ? { webhooks: true } : {},
  current,
  purchasable: false,
});

function billing(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'manual',
    self_serve: false,
    state: 'trial',
    read_only: false,
    message: null,
    plan_code: 'starter',
    plan_name: 'Starter',
    trial_ends_at: new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString(),
    grace_ends_at: null,
    period_end: null,
    has_portal: false,
    usage: [
      { key: 'connections', label: 'Azure connections', used: 1, limit: 1 },
      { key: 'ai_messages', label: 'AI messages this month', used: 12, limit: 200 },
    ],
    plans: [plan('starter', 'Starter', '10.00', true), plan('pro', 'Pro', '49.00')],
    ...overrides,
  };
}

describe('BillingPage', () => {
  it('shows the plan, usage and lets an owner request an upgrade (manual billing)', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/billing': billing(),
      'POST /api/v1/billing/upgrade-request': { ok: true },
    });
    renderRoutes([{ path: '/', element: <BillingPage /> }]);
    expect(await screen.findByText('Starter plan')).toBeInTheDocument();
    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 Azure connections/)).toBeInTheDocument();
    expect(screen.getByText('5 connections')).toBeInTheDocument();
    expect(screen.getAllByText('Unlimited AI messages / month')).toHaveLength(2);
    expect(screen.getByText('Teams, Slack & webhooks')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Request Pro' }));
    const call = fetch.mock.calls.find(([input]) => String(input instanceof Request ? input.url : input).includes('upgrade-request'));
    expect(call).toBeDefined();
  });

  it('explains read-only mode', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/billing': billing({
        state: 'trial_expired',
        read_only: true,
        message: 'Your trial has ended, so KloudRecon is read-only. Choose a plan to continue.',
      }),
    });
    renderRoutes([{ path: '/', element: <BillingPage /> }]);
    expect(await screen.findByText('Trial ended · read-only')).toBeInTheDocument();
    expect(screen.getByText(/Your data stays available/)).toBeInTheDocument();
  });
});

describe('BillingBanner', () => {
  it('counts down the trial', async () => {
    mockApi({ 'GET /api/v1/me': me, 'GET /api/v1/billing': billing() });
    renderRoutes([{ path: '/', element: <BillingBanner /> }]);
    expect(await screen.findByText('3 days left in your trial.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute('href', '/app/settings/billing');
  });

  it('warns when the organization is read-only', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/billing': billing({ state: 'payment_overdue', read_only: true, message: 'A payment is overdue.' }),
    });
    renderRoutes([{ path: '/', element: <BillingBanner /> }]);
    expect(await screen.findByRole('alert')).toHaveTextContent('A payment is overdue.');
  });
});
