import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { ConnectionDetailPage } from './ConnectionDetailPage';
import { ConnectionsPage } from './ConnectionsPage';
import { ConnectionWizard } from './ConnectionWizard';
import { connectionSchema, splitIds, toCreateBody } from './form';

afterEach(() => {
  vi.unstubAllGlobals();
});

const activeAdmin = {
  ...baseMe,
  state: 'active',
  user: {
    id: 'u1',
    org_id: 'o1',
    email: 'admin@acme.test',
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
  org: {
    id: 'o1',
    name: 'Acme Corp',
    country: null,
    size: null,
    industry: null,
    status: 'active',
    plan_id: null,
    trial_ends_at: null,
    created_at: '2026-09-01T00:00:00Z',
  },
};

const valid = {
  name: 'Prod',
  tenant_id: '22222222-bbbb-4ccc-8ddd-000000000000',
  client_id: '33333333-cccc-4ddd-8eee-000000000000',
  client_secret: 'kr~abc.Secret_Value~123',
  secret_expires_on: '2027-01-01',
  scope_type: 'all' as const,
  subscription_ids: '',
  management_group_id: '',
};

const connection = {
  id: 'c1',
  name: 'Prod',
  tenant_id: valid.tenant_id,
  client_id: valid.client_id,
  is_demo: false,
  status: 'partially_valid',
  tiers: { core: true, identity: false, commitments: false },
  scope: { type: 'all' },
  secret: { stored: true, expires_on: '2026-10-10', days_left: 14, updated_at: null },
  validated_at: '2026-09-26T10:00:00Z',
  validation: {
    status: 'partially_valid',
    checked_at: '2026-09-26T10:00:00Z',
    duration_ms: 3100,
    checks: [
      {
        key: 'sign_in',
        label: 'Sign in with the app registration',
        status: 'pass',
        message: 'Signed in.',
        details: {},
      },
      {
        key: 'cost',
        label: 'Read Cost Management data',
        status: 'warn',
        message: 'Cost data is not available for Sponsorship.',
        details: {},
      },
    ],
    subscriptions: [],
    management_groups: [],
    graph_permissions: {},
  },
  last_scan_id: null,
  last_scan_at: null,
  last_scan_status: null,
  subscription_count: 1,
  enabled_subscription_count: 1,
  daily_scan_hour_utc: null,
  created_at: '2026-09-26T10:00:00Z',
  updated_at: '2026-09-26T10:00:00Z',
  subscriptions: [
    {
      id: 's1',
      connection_id: 'c1',
      subscription_id: '11111111-aaaa-4bbb-8ccc-000000000001',
      name: 'Contoso Test Prod',
      state: 'Enabled',
      enabled: true,
      is_production: false,
      cost_available: true,
      access: {},
      disabled_reason: null,
      last_seen_at: null,
    },
  ],
  management_groups: [],
};

describe('connection form schema', () => {
  it('accepts a valid form and builds the API body', () => {
    const parsed = connectionSchema.parse(valid);
    const body = toCreateBody(parsed, { core: true, identity: true, commitments: false });
    expect(body.scope).toEqual({ type: 'all', subscription_ids: [], management_group_id: null });
    expect(body.tiers).toEqual({ core: true, identity: true, commitments: false });
  });

  it('rejects a pasted secret ID with a friendly message', () => {
    const result = connectionSchema.safeParse({
      ...valid,
      client_secret: '9f3e2d1c-4b5a-4c6d-9e8f-0a1b2c3d4e5f',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('secret ID');
  });

  it('requires subscription IDs for the selected-subscriptions scope', () => {
    expect(
      connectionSchema.safeParse({ ...valid, scope_type: 'subscriptions', subscription_ids: 'x' })
        .success,
    ).toBe(false);
    expect(splitIds('a, b\nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('ConnectionsPage', () => {
  it('shows the connect call to action for admins when empty', async () => {
    mockApi({ 'GET /api/v1/me': activeAdmin, 'GET /api/v1/connections': [] });
    renderRoutes([{ path: '/', element: <ConnectionsPage /> }]);
    expect(await screen.findByText('Connect your Azure environment')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Add connection/ })).toHaveAttribute(
      'href',
      '/app/settings/connections/new',
    );
  });

  it('masks the secret and shows its expiry', async () => {
    mockApi({ 'GET /api/v1/me': activeAdmin, 'GET /api/v1/connections': [connection] });
    renderRoutes([{ path: '/', element: <ConnectionsPage /> }]);
    expect(await screen.findByText('Valid with warnings')).toBeInTheDocument();
    expect(screen.getByText('(expires in 14 days)')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret stored')).toHaveTextContent('••••••••');
  });
});

describe('ConnectionDetailPage', () => {
  it('renders the checklist with icon + label and subscriptions', async () => {
    mockApi({ 'GET /api/v1/me': activeAdmin, 'GET /api/v1/connections/c1': connection });
    renderRoutes([{ path: '/c/:connectionId', element: <ConnectionDetailPage /> }], {
      path: '/c/c1',
    });
    expect(await screen.findByText('Validation checklist')).toBeInTheDocument();
    expect(screen.getByText(/Cost data is not available/)).toBeInTheDocument();
    expect(screen.getByText(': Warning')).toBeInTheDocument();
    expect(screen.getByText('Contoso Test Prod')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Replace secret/ })).toBeInTheDocument();
  });
});

describe('ConnectionWizard', () => {
  it('walks through the steps and shows the validation result', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/me': activeAdmin,
      'POST /api/v1/connections': [201, { connection, validation: connection.validation }],
    });
    const user = userEvent.setup();
    renderRoutes([{ path: '/', element: <ConnectionWizard /> }]);
    await user.click(await screen.findByRole('button', { name: /Continue/ }));
    expect(screen.getByText('Create a read-only app registration')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /I have the IDs/ }));
    await user.type(screen.getByLabelText('Directory (tenant) ID'), valid.tenant_id);
    await user.type(screen.getByLabelText('Application (client) ID'), valid.client_id);
    await user.type(screen.getByLabelText('Client secret Value'), valid.client_secret);
    await user.click(screen.getByRole('button', { name: /Save & validate/ }));
    expect(await screen.findByText('Validation result')).toBeInTheDocument();
    expect(screen.getByText('Valid with warnings')).toBeInTheDocument();
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([input]) => input instanceof Request && input.method === 'POST',
      );
      expect(post).toBeDefined();
    });
  });
});
