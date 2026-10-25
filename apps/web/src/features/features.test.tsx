import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appNav } from '@/components/layout/nav';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBadge } from '@/components/StatusBadge';
import { TooltipProvider } from '@/components/ui/misc';
import { ApprovalsPage } from '@/features/owner/ApprovalsPage';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatusBadge', () => {
  it('always shows a text label (never color alone)', () => {
    render(<StatusBadge status="pending_approval" />);
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
  });
});

describe('Sidebar', () => {
  const renderSidebar = (role: string) =>
    render(
      <MemoryRouter>
        <TooltipProvider>
          <Sidebar sections={appNav} homePath="/app" orgRole={role} forceExpanded />
        </TooltipProvider>
      </MemoryRouter>,
    );

  it('links every module (no module is still "coming soon")', () => {
    renderSidebar('owner');
    expect(screen.queryByText('Soon')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reports/ })).toHaveAttribute('href', '/app/reports');
    expect(screen.getByRole('link', { name: /Recommendations/ })).toHaveAttribute('href', '/app/recommendations');
    expect(screen.getByRole('link', { name: /Diagrams/ })).toHaveAttribute('href', '/app/diagrams');
    expect(screen.getByRole('link', { name: /Cost & FinOps/ })).toHaveAttribute('href', '/app/cost');
    expect(screen.getByRole('link', { name: /Inventory/ })).toHaveAttribute(
      'href',
      '/app/inventory',
    );
    expect(screen.getByRole('link', { name: /Team/ })).toHaveAttribute(
      'href',
      '/settings/team'.replace(/^/, '/app'),
    );
  });

  it('hides admin-only entries from members', () => {
    renderSidebar('member');
    expect(screen.queryByText('Audit log')).not.toBeInTheDocument();
  });
});

describe('ApprovalsPage', () => {
  const registration = {
    org: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Contoso Test',
      country: 'Germany',
      size: '51-200',
      industry: 'Finance',
      status: 'pending_approval',
      plan_id: null,
      trial_ends_at: null,
      created_at: '2026-09-26T08:00:00Z',
    },
    owner: {
      id: '22222222-2222-2222-2222-222222222222',
      org_id: '11111111-1111-1111-1111-111111111111',
      email: 'jane@contoso.test',
      name: 'Jane Doe',
      job_title: 'CTO',
      phone: null,
      org_role: 'owner',
      platform_role: null,
      status: 'pending_approval',
      last_login_at: null,
      created_at: '2026-09-26T08:00:00Z',
      notification_prefs: {},
    },
    use_case: 'Security review before our audit.',
    waiting_seconds: 7200,
  };
  const plans = [
    {
      id: 'p1',
      code: 'trial',
      name: 'Trial',
      description: '',
      price_monthly: '0.00',
      currency: 'USD',
      limits: {},
      features: {},
      active: true,
      sort_order: 0,
    },
    {
      id: 'p2',
      code: 'starter',
      name: 'Starter',
      description: '',
      price_monthly: '10.00',
      currency: 'USD',
      limits: {},
      features: {},
      active: true,
      sort_order: 1,
    },
  ];

  it('shows the queue with wait time and approves with a plan', async () => {
    mockApi({
      'GET /api/v1/me': { ...baseMe, state: 'active', is_platform_owner: true },
      'GET /api/v1/owner/registrations': [registration],
      'GET /api/v1/owner/plans': plans,
      [`POST /api/v1/owner/registrations/${registration.org.id}/approve`]: {
        ...registration.org,
        status: 'active',
        member_count: 1,
        plan_name: 'Starter',
      },
    });
    const fetchMock = vi.mocked(fetch);
    renderRoutes([{ path: '/owner/approvals', element: <ApprovalsPage /> }], {
      path: '/owner/approvals',
    });

    expect(await screen.findByText('Contoso Test')).toBeInTheDocument();
    expect(screen.getByText('2h 0m')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Plan'), 'starter');
    await userEvent.click(within(dialog).getByRole('button', { name: /Approve/ }));

    const isApprove = (input: unknown) =>
      input instanceof Request && input.url.endsWith('/approve');
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => isApprove(input))).toBe(true);
    });
    const request = fetchMock.mock.calls.find(([input]) => isApprove(input))?.[0] as Request;
    const body: unknown = await request.clone().json();
    expect(body).toEqual({ plan_code: 'starter', trial_days: 14 });
  });
});
