import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { AlertsPage } from './AlertsPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const me = (features: Record<string, boolean>) => ({
  ...baseMe,
  state: 'active',
  user: { id: 'u1', org_role: 'admin' },
  org: { id: 'o1', name: 'Acme' },
  plan: { id: 'p1', code: 'x', name: 'Plan', description: '', price_monthly: '10', currency: 'USD', limits: {}, features, active: true, sort_order: 1 },
});

const events = [
  { key: 'new_critical_risk', title: 'New critical risk', description: 'A new critical finding.', builtin_notice: false },
  { key: 'risky_change', title: 'Risky change', description: 'A risky change.', builtin_notice: true },
];

const rule = (id: string, name: string, event_type: string, channels: Record<string, unknown>) => ({
  id,
  name,
  event_type,
  config: {},
  channels,
  enabled: true,
  created_at: '2026-09-30T10:00:00Z',
  updated_at: '2026-09-30T10:00:00Z',
});

describe('AlertsPage', () => {
  it('lists rules with their channels and gates webhooks by plan', async () => {
    mockApi({
      'GET /api/v1/me': me({}),
      'GET /api/v1/alerts/events': events,
      'GET /api/v1/alerts/rules': [
        rule('r1', 'Critical risks', 'new_critical_risk', { in_app: true, email: true, integrations: [] }),
        rule('r2', 'Risky changes', 'risky_change', { in_app: false, email: false, integrations: [] }),
      ],
      'GET /api/v1/integrations': [],
      'GET /api/v1/alerts/deliveries': [],
    });
    renderRoutes([{ path: '/', element: <AlertsPage /> }]);
    const row = (await screen.findByText('Critical risks')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('In-app')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('No channels')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Channels' }));
    expect(await screen.findByText('Available on Pro and Enterprise')).toBeInTheDocument();
  });

  it('shows channels and the delivery log on plans with webhooks', async () => {
    mockApi({
      'GET /api/v1/me': me({ webhooks: true }),
      'GET /api/v1/alerts/events': events,
      'GET /api/v1/alerts/rules': [],
      'GET /api/v1/integrations': [
        {
          id: 'i1',
          kind: 'teams',
          name: '#cloud-alerts',
          url_hint: 'contoso.webhook.office.com',
          enabled: true,
          last_status: 'ok',
          last_delivery_at: '2026-09-30T10:00:00Z',
          last_error: null,
          created_at: '2026-09-30T09:00:00Z',
        },
      ],
      'GET /api/v1/alerts/deliveries': [
        {
          id: 'd1',
          rule_id: 'r1',
          integration_id: 'i1',
          channel: 'teams',
          event_type: 'new_critical_risk',
          title: '2 new critical risks',
          status: 'sent',
          attempts: 1,
          response_code: 200,
          error: null,
          created_at: '2026-09-30T10:00:00Z',
          sent_at: '2026-09-30T10:00:01Z',
        },
      ],
    });
    renderRoutes([{ path: '/', element: <AlertsPage /> }]);
    await userEvent.click(await screen.findByRole('tab', { name: 'Channels' }));
    expect(await screen.findByText('#cloud-alerts')).toBeInTheDocument();
    expect(screen.getByText('contoso.webhook.office.com')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Delivery log' }));
    expect(await screen.findByText('2 new critical risks')).toBeInTheDocument();
    expect(screen.getByText(/sent/)).toBeInTheDocument();
  });
});
