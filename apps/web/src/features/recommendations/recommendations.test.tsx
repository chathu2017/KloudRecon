import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { RecommendationsPage } from './RecommendationsPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const rec = (over: Record<string, unknown>) => ({
  ref: 'f-11111111-1111-1111-1111-111111111111',
  source: 'rule',
  kind: 'risk',
  title: 'SQL server firewall allows the whole internet',
  detail: 'Anyone can try to log in.',
  category: 'Databases',
  pillar: 'security',
  severity: 'critical',
  risk_score: 95,
  monthly_saving: 0,
  currency: 'USD',
  confidence: 'high',
  effort: 'low',
  impact: 95,
  priority: 95,
  band: 'P1',
  status: 'open',
  assignee_id: null,
  assignee_name: null,
  due_at: null,
  overdue: false,
  arm_id: '/subscriptions/x/resourcegroups/rg/providers/microsoft.sql/servers/sql-prod',
  resource_name: 'sql-prod',
  resource_type: 'microsoft.sql/servers',
  resource_group: 'rg-data',
  subscription_id: 'x',
  finding_id: '11111111-1111-1111-1111-111111111111',
  rule_id: 'sql-firewall-open',
  link: '/app/security/findings/11111111-1111-1111-1111-111111111111',
  first_seen: '2026-09-20T00:00:00Z',
  ...over,
});

const list = {
  headline: {
    currency: 'USD',
    open_count: 2,
    monthly_savings: 1840,
    yearly_savings: 22080,
    critical: 1,
    high: 0,
    risk_points: 95,
    top10_risk_reduction_pct: 100,
    by_band: { P1: 1, P2: 1, P3: 0, P4: 0 },
    by_status: { open: 2 },
    by_source: { rule: 1, rightsizing: 1 },
  },
  items: [
    rec({}),
    rec({
      ref: 'rs-0123456789abcdef',
      source: 'rightsizing',
      kind: 'savings',
      title: 'Resize sqldb-payments from BC_Gen5_8 to BC_Gen5_4',
      severity: null,
      risk_score: 0,
      monthly_saving: 1840,
      priority: 55,
      band: 'P2',
      finding_id: null,
      rule_id: null,
      link: '/app/cost/rightsizing',
      status: 'in_progress',
    }),
  ],
  total: 2,
};

const me = {
  ...baseMe,
  state: 'active',
  user: { id: 'u1', org_role: 'admin', email: 'jane@contoso.test', name: 'Jane' },
  org: { id: 'o1', name: 'Contoso' },
};

describe('RecommendationsPage', () => {
  it('shows the savings and risk headline, the table and a ticket', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/recommendations': list,
      'GET /api/v1/team/members': [],
      'GET /api/v1/recommendations/f-11111111-1111-1111-1111-111111111111/comments': [],
      'GET /api/v1/recommendations/f-11111111-1111-1111-1111-111111111111/ticket': {
        format: 'jira',
        title: '[P1] SQL server firewall allows the whole internet',
        body: 'h2. SQL server firewall allows the whole internet',
      },
    });
    renderRoutes([{ path: '/app/recommendations', element: <RecommendationsPage /> }], {
      path: '/app/recommendations',
    });
    expect(await screen.findByText('$22,080 per year')).toBeInTheDocument();
    expect(screen.getAllByText('$1,840/mo').length).toBeGreaterThan(0);
    expect(screen.getByText('1 critical · 0 high')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Resize sqldb-payments from BC_Gen5_8 to BC_Gen5_4')).toBeInTheDocument();
    // the table asks for the active backlog by default
    const url = new URL((fetchMock.mock.calls.find((c) => (c[0] as Request).url.includes('/recommendations?'))?.[0] as Request).url);
    expect(url.searchParams.getAll('status')).toEqual(['open', 'in_progress']);

    await userEvent.click(within(table).getByRole('button', { name: 'SQL server firewall allows the whole internet' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Jira' }));
    expect(await within(dialog).findByText('h2. SQL server firewall allows the whole internet')).toBeInTheDocument();
    // findings are dismissed through an exception, so the drawer does not offer it
    expect(within(dialog).queryByRole('option', { name: 'Dismissed' })).not.toBeInTheDocument();
  });

  it('groups items into Kanban columns', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/recommendations': list,
      'GET /api/v1/team/members': [],
    });
    renderRoutes([{ path: '/app/recommendations', element: <RecommendationsPage /> }], {
      path: '/app/recommendations?view=board',
    });
    const open = await screen.findByRole('region', { name: 'Open column' });
    await waitFor(() => expect(within(open).getByText(list.items[0]?.title ?? '')).toBeInTheDocument());
    const progress = screen.getByRole('region', { name: 'In progress column' });
    expect(within(progress).getByText(list.items[1]?.title ?? '')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Done column' })).getByText('Nothing here')).toBeInTheDocument();
  });
});
