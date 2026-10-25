import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/misc';
import { ChangesPage } from '@/features/changes/ChangesPage';
import { ComparePage } from '@/features/changes/ComparePage';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { InventoryPage } from './InventoryPage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const me = { ...baseMe, state: 'active' };
const VM_ID =
  '/subscriptions/s1/resourcegroups/rg-jumpbox-prod/providers/microsoft.compute/virtualmachines/vm-prod-jumpbox01';

const vm = {
  id: 'r1',
  scan_id: 'scan2',
  connection_id: 'c1',
  arm_id: VM_ID,
  name: 'vm-prod-jumpbox01',
  type: 'microsoft.compute/virtualmachines',
  kind: null,
  location: 'eastus',
  resource_group: 'rg-jumpbox-prod',
  subscription_id: 's1',
  subscription_name: 'Contoso-Prod',
  sku: 'Standard_B2ms',
  tags: { env: 'prod' },
  monthly_cost: null,
  risk_level: null,
};

const facets = {
  total: 1,
  types: [{ value: 'microsoft.compute/virtualmachines', label: 'x', count: 1 }],
  resource_groups: [{ value: 'rg-jumpbox-prod', label: 'rg-jumpbox-prod', count: 1 }],
  subscriptions: [{ value: 's1', label: 'Contoso-Prod', count: 1 }],
  locations: [{ value: 'eastus', label: 'eastus', count: 1 }],
  tag_keys: [{ value: 'env', label: 'env', count: 1 }],
  scan_ids: ['scan2'],
};

const change = {
  id: 'ch1',
  connection_id: 'c1',
  scan_id: 'scan2',
  arm_id: VM_ID,
  resource_name: 'vm-prod-jumpbox01',
  resource_type: 'microsoft.compute/virtualmachines',
  resource_group: 'rg-jumpbox-prod',
  subscription_id: 's1',
  change_type: 'modified',
  source: 'snapshot',
  operation: 'Microsoft.Compute/virtualMachines/write',
  diff: {
    fields: [
      { path: 'properties.hardwareProfile.vmSize', before: 'Standard_B2s', after: 'Standard_B2ms' },
    ],
  },
  caller: 'lee.dev@contoso.example',
  caller_type: 'user',
  occurred_at: '2026-09-25T10:00:00Z',
  risky: true,
  risk_reason: 'Inbound rule open to the internet: allow-rdp',
};

const detail = {
  ...vm,
  properties: { hardwareProfile: { vmSize: 'Standard_B2ms' } },
  identity: { type: 'SystemAssigned' },
  managed_by: null,
  zones: null,
  raw_sku: null,
  portal_url: `https://portal.azure.com/#@tenant/resource${VM_ID}`,
  related: [
    {
      arm_id: '/x/nic-vm-prod-jumpbox01',
      name: 'nic-vm-prod-jumpbox01',
      type: 'microsoft.network/networkinterfaces',
      edge_type: 'nic',
      direction: 'out',
      attrs: {},
      in_inventory: true,
    },
  ],
  changes: [change],
  orphan_reason: null,
  scan_started_at: '2026-09-25T12:00:00Z',
};

function routes(element: React.ReactElement) {
  return [{ path: '/', element: <TooltipProvider>{element}</TooltipProvider> }];
}

describe('InventoryPage', () => {
  it('lists resources and opens the resource drawer', async () => {
    // jsdom has no layout: give the virtualized list a viewport.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200);
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/resources': { items: [vm], total: 1, next_cursor: null, scan_ids: ['scan2'] },
      'GET /api/v1/resources/facets': facets,
      'GET /api/v1/resources/orphans': { items: [], by_category: {} },
      'GET /api/v1/resources/detail': detail,
    });
    const user = userEvent.setup();
    renderRoutes(routes(<InventoryPage />));
    expect(await screen.findByText(/1 resources across 1 subscription/)).toBeInTheDocument();
    const row = await screen.findByRole('button', { name: /vm-prod-jumpbox01/ });
    expect(screen.getByText('Standard_B2ms')).toBeInTheDocument();
    await user.click(row);
    expect(await screen.findByRole('link', { name: /Azure portal/ })).toHaveAttribute(
      'href',
      detail.portal_url,
    );
    await user.click(screen.getByRole('tab', { name: /Related/ }));
    expect(await screen.findByText('nic-vm-prod-jumpbox01')).toBeInTheDocument();
  });

  it('shows the connect prompt before the first scan', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/resources': { items: [], total: 0, next_cursor: null, scan_ids: [] },
      'GET /api/v1/resources/facets': { ...facets, total: 0, scan_ids: [] },
      'GET /api/v1/resources/orphans': { items: [], by_category: {} },
    });
    renderRoutes(routes(<InventoryPage />));
    expect(await screen.findByText('No inventory yet')).toBeInTheDocument();
  });
});

describe('ChangesPage', () => {
  it('shows risky changes with icon + label and the caller', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/changes': { items: [change], next_cursor: null },
      'GET /api/v1/changes/summary': {
        days: [{ day: '2026-09-25', created: 0, deleted: 0, modified: 1, activity: 0, risky: 1 }],
        totals: { modified: 1, risky: 1 },
      },
    });
    const user = userEvent.setup();
    renderRoutes(routes(<ChangesPage />));
    expect(await screen.findByText(/Inbound rule open to the internet/)).toBeInTheDocument();
    expect(screen.getAllByText('Risky').length).toBeGreaterThanOrEqual(2); // badge + legend
    expect(screen.getByText(/by lee.dev@contoso.example/)).toBeInTheDocument();
    expect(screen.getByText(/properties.hardwareProfile.vmSize/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Modified' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Risky only/ }));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) =>
        input instanceof Request ? input.url : String(input),
      );
      expect(urls.some((u) => u.includes('risky=true'))).toBe(true);
    });
  });
});

describe('ComparePage', () => {
  const scan = (id: string, seq: number) => ({
    id,
    connection_id: 'c1',
    connection_name: 'Demo',
    sequence: seq,
    trigger: 'seed',
    status: 'succeeded',
    stage: null,
    progress: 100,
    started_at: `2026-09-2${seq}T10:00:00Z`,
    finished_at: null,
    created_at: `2026-09-2${seq}T10:00:00Z`,
    stats: {},
    error: null,
  });

  it('compares the two latest scans by default', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/scans': [scan('b', 2), scan('a', 1)],
      'GET /api/v1/compare': {
        from_scan: scan('a', 1),
        to_scan: scan('b', 2),
        added: [
          {
            arm_id: '/x/vm-new',
            name: 'vm-new',
            type: 'microsoft.compute/virtualmachines',
            resource_group: 'rg',
            fields: [],
          },
        ],
        removed: [],
        changed: [],
        counts: { from_total: 10, to_total: 11, added: 1, removed: 0, changed: 0 },
        by_type: [],
        truncated: false,
      },
    });
    renderRoutes(routes(<ComparePage />));
    expect(await screen.findByText('vm-new')).toBeInTheDocument();
    expect(screen.getByText('10 → 11')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([input]) =>
      (input instanceof Request ? input.url : String(input)).includes('/compare'),
    );
    const url = String(call?.[0] instanceof Request ? call[0].url : call?.[0]);
    expect(url).toContain('from=a');
    expect(url).toContain('to=b');
  });
});
