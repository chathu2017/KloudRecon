import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { OverviewPage } from './OverviewPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const me = {
  ...baseMe,
  state: 'active',
  user: {
    id: 'u1',
    org_id: 'o1',
    email: 'a@b.test',
    name: 'Alex Admin',
    job_title: null,
    phone: null,
    org_role: 'owner',
    platform_role: null,
    status: 'active',
    last_login_at: null,
    created_at: '2026-09-01T00:00:00Z',
    notification_prefs: {},
  },
};

const empty = {
  connections: [],
  latest_scan: null,
  active_scan: null,
  counts: { resources: 0 },
  resource_delta: null,
  by_type: [],
  by_location: [],
  by_subscription: [],
  changes_since_last_scan: {},
  changes_7d: {},
  recent_changes: [],
  history: [],
  attention: [],
};

describe('OverviewPage', () => {
  it('guides a new customer to connect Azure', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/overview': empty,
      'GET /api/v1/team/members': [],
    });
    renderRoutes([{ path: '/', element: <OverviewPage /> }]);
    expect(await screen.findByText('Get started')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Connect Azure/ })).toHaveAttribute(
      'href',
      '/app/settings/connections/new',
    );
  });

  it('shows inventory KPIs, attention items and trends', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/overview': {
        ...empty,
        connections: [{ id: 'c1', name: 'Demo', status: 'valid' }],
        counts: {
          resources: 589,
          subscriptions: 4,
          resource_groups: 30,
          locations: 3,
          types: 48,
          orphans: 27,
        },
        resource_delta: 3,
        changes_since_last_scan: { created: 3, deleted: 1, modified: 5, risky: 2 },
        by_type: [{ type: 'microsoft.compute/virtualmachines', count: 72 }],
        by_location: [{ location: 'eastus', count: 500 }],
        by_subscription: [{ subscription_id: 's1', name: 'Contoso-Prod', count: 300 }],
        history: [
          { scan_id: 'a', resources: 584 },
          { scan_id: 'b', resources: 589 },
        ],
        attention: [
          {
            severity: 'high',
            title: 'Client secret of Prod expires in 5 day(s)',
            detail: 'Replace it.',
            link: '/app/settings/connections/c1',
          },
        ],
      },
    });
    renderRoutes([{ path: '/', element: <OverviewPage /> }]);
    expect(await screen.findByText('589')).toBeInTheDocument();
    expect(screen.getByText('+3 since previous scan')).toBeInTheDocument();
    expect(screen.getByText('2 risky')).toBeInTheDocument();
    expect(screen.getByText('Virtual machine')).toBeInTheDocument();
    expect(screen.getByText('East US')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Client secret of Prod/ })).toHaveAttribute(
      'href',
      '/app/settings/connections/c1',
    );
    expect(screen.getByRole('img', { name: /from 584 to 589/ })).toBeInTheDocument();
  });
});
