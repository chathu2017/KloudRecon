import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/misc';
import { OverviewPage } from '@/pages/app/OverviewPage';
import { str } from '@/lib/format';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { FindingsPage } from './FindingsPage';
import { RiskScore, SeverityBadge } from './severity';

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

const finding = {
  id: 'f1',
  connection_id: 'c1',
  rule_id: 'NET-001',
  source: 'rule',
  category: 'Network',
  area: 'network',
  pillar: 'security',
  severity: 'critical',
  risk_score: 92,
  arm_id: '/subscriptions/s1/resourcegroups/rg/providers/microsoft.compute/virtualmachines/vm-jump',
  resource_name: 'vm-jump',
  resource_type: 'microsoft.compute/virtualmachines',
  resource_group: 'rg',
  subscription_id: 's1',
  location: 'eastus',
  title: 'RDP is open to the internet',
  status: 'open',
  status_reason: null,
  assignee_id: null,
  assignee_name: null,
  due_at: null,
  overdue: false,
  first_seen: '2026-09-20T00:00:00Z',
  last_seen: '2026-09-26T00:00:00Z',
  resolved_at: null,
  est_monthly_savings: null,
  effort: 'low',
  reopened_count: 0,
};

const summary = {
  open_by_severity: { critical: 1, high: 4, medium: 9, low: 2 },
  by_status: { open: 16 },
  by_source: { rule: 16 },
  by_pillar: { security: 16 },
  overdue: 0,
  new_since_last_scan: 2,
  resolved_since_last_scan: 1,
  mttr_days: { critical: 3 },
  trend: [],
  exposed: 3,
  attack_paths: 3,
  secure_score: 61,
  toxic: 2,
  vulnerabilities: 4,
  alerts: 2,
};

describe('severity display', () => {
  it('shows icon + text label, never color alone', () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('falls back to Info for unknown severities', () => {
    render(<SeverityBadge severity="weird" />);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('labels the risk score for screen readers', () => {
    render(<RiskScore score={77} />);
    expect(screen.getByTitle('Risk score 77 of 100')).toBeInTheDocument();
  });

  it('never renders objects as [object Object]', () => {
    expect(str({ a: 1 })).toBe('{"a":1}');
    expect(str(null)).toBe('');
    expect(str(4)).toBe('4');
  });
});

describe('FindingsPage', () => {
  it('lists findings with severity KPIs and filters by severity', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/security/summary': summary,
      'GET /api/v1/security/findings': { items: [finding], total: 1, offset: 0, limit: 50 },
      'GET /api/v1/security/findings/facets': {
        severity: [{ value: 'critical', label: 'Critical', count: 1 }],
        status: [],
        source: [],
        pillar: [],
        category: [],
        area: [],
      },
      'GET /api/v1/team/members': [],
    });
    const user = userEvent.setup();
    renderRoutes([
      {
        path: '/',
        element: (
          <TooltipProvider>
            <FindingsPage />
          </TooltipProvider>
        ),
      },
    ]);
    expect(await screen.findByText('RDP is open to the internet')).toBeInTheDocument();
    expect(screen.getByText('vm-jump')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Critical/ })[0] as HTMLElement);
    const calls = fetchMock.mock.calls.map((c) => {
      const input = c[0] as RequestInfo | URL;
      return input instanceof Request ? input.url : String(input);
    });
    expect(
      calls.some((u) => u.includes('/security/findings?') && u.includes('severity=critical')),
    ).toBe(true);
  });
});

describe('OverviewPage security block', () => {
  it('shows the score, risk KPIs and top risks', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/team/members': [],
      'GET /api/v1/overview': {
        connections: [{ id: 'c1', name: 'Demo', status: 'valid' }],
        latest_scan: null,
        active_scan: null,
        counts: { resources: 589 },
        resource_delta: null,
        by_type: [],
        by_location: [],
        by_subscription: [],
        changes_since_last_scan: {},
        changes_7d: {},
        recent_changes: [],
        history: [],
        attention: [],
        security: {
          score: {
            overall: 72,
            grade: 'C',
            security: 58,
            cost: 81,
            reliability: 70,
            operations: 75,
            performance: 90,
            governance: 66,
          },
          secure_score: 61.4,
          critical_risks: 1,
          high_risks: 4,
          exposed: 3,
          attack_paths: 3,
          open_findings: 16,
          by_severity: { critical: 1, high: 4 },
          potential_savings: 0,
          compliance: { framework: 'cis', name: 'CIS Azure', percent: 64, controls_failing: 12 },
          top_risks: [finding],
          score_history: [],
        },
      },
    });
    renderRoutes([{ path: '/', element: <OverviewPage /> }]);
    expect(await screen.findByText('KloudRecon score')).toBeInTheDocument();
    expect(screen.getByText('Grade C')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Attack paths/ })).toHaveAttribute(
      'href',
      '/app/security/attack-paths',
    );
    expect(screen.getByRole('link', { name: /CIS Azure compliance/ })).toHaveAttribute(
      'href',
      '/app/security/compliance/cis',
    );
    expect(screen.getByRole('link', { name: /RDP is open to the internet/ })).toHaveAttribute(
      'href',
      '/app/security/findings/f1',
    );
  });
});
