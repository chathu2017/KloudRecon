import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoutes } from '@/test/utils';
import { DocumentPage } from './DocumentPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const doc = {
  title: 'Architecture of Contoso',
  scan_id: 's1',
  scan_sequence: 4,
  scan_started_at: '2026-09-27T10:00:00Z',
  generated_at: '2026-09-28T10:00:00Z',
  currency: 'USD',
  summary: [{ label: 'Resources', value: '590' }],
  sections: [
    { key: 'overview', title: 'Overview', view: null, paragraphs: ['This document describes Contoso.'], facts: [] },
    { key: 'hub_spoke', title: 'Hub and spoke', view: 'hub_spoke', paragraphs: ['Hub vnet-hub is peered with 2 networks.'], facts: [{ label: 'Hubs', value: '1' }] },
    { key: 'region', title: 'Regions', view: 'region', paragraphs: ['East US is the primary region.'], facts: [] },
  ],
  components: [
    {
      category: 'compute',
      label: 'Compute',
      count: 1,
      monthly_cost: 120,
      truncated: false,
      rows: [
        { arm_id: '/vm', name: 'vm-web', type: 'microsoft.compute/virtualmachines', type_label: 'Virtual machine', subscription: 'Prod', resource_group: 'rg-web', region: 'East US', sku: 'D4s_v5', monthly_cost: 120 },
      ],
    },
  ],
  address_plan: {
    vnets: [
      {
        arm_id: '/vnet-hub',
        name: 'vnet-hub',
        subscription: 'Connectivity',
        region: 'East US',
        role: 'hub',
        address_space: ['10.0.0.0/16'],
        addresses: 65536,
        allocated: 320,
        peerings: ['vnet-spoke'],
        dns_servers: [],
        subnets: [
          { name: 'AzureFirewallSubnet', prefix: '10.0.1.0/26', addresses: 64, usable: 59, in_use: 50, utilization: 0.85, nsg: null, route_table: null, delegation: null, service_endpoints: [] },
        ],
      },
    ],
    on_premises: [{ label: 'dc1', value: '172.16.0.0/16' }],
    total_addresses: 65536,
    allocated: 320,
    issues: [{ severity: 'high', message: 'vnet-hub and on-premises (dc1) overlap.', refs: [] }],
  },
  security: { score: { overall: 71, grade: 'C' }, open_findings: 10, by_severity: { critical: 1 }, exposed: 2, attack_paths: 1, compliance: null, top_risks: ['Admin without MFA'] },
  cost: { last30_actual: 38438, forecast_month_end: 36175, potential_savings: 1200, by_category: [{ label: 'Compute', monthly_cost: 120 }] },
};

describe('architecture document', () => {
  it('renders the narrative, address plan, components and posture with an outline', async () => {
    mockApi({ '/api/v1/diagrams/document': doc });
    renderRoutes([{ path: '/', element: <DocumentPage /> }]);
    expect(await screen.findByRole('heading', { name: 'Architecture of Contoso' })).toBeInTheDocument();
    expect(screen.getByText('Hub vnet-hub is peered with 2 networks.')).toBeInTheDocument();
    // the address plan sits after the network sections and before the rest
    const outline = within(screen.getByRole('navigation', { name: 'Document outline' }));
    const titles = outline.getAllByRole('link').map((a) => a.textContent);
    expect(titles).toEqual(['1.Overview', '2.Hub and spoke', '3.Network address plan', '4.Regions', '5.Components', '6.Security and cost']);
    expect(screen.getByText('AzureFirewallSubnet')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('vnet-hub and on-premises (dc1) overlap.')).toBeInTheDocument();
    expect(screen.getByText('vm-web')).toBeInTheDocument();
    expect(screen.getByText('Admin without MFA')).toBeInTheDocument();
    // every view section links to its interactive diagram
    expect(screen.getAllByRole('link', { name: /Open interactive/ }).map((a) => a.getAttribute('href'))).toEqual([
      '/app/diagrams?view=hub_spoke',
      '/app/diagrams?view=region',
    ]);
  });

  it('explains when there is no finished scan', async () => {
    mockApi({ '/api/v1/diagrams/document': [404, { error: { code: 'not_found', message: 'No finished scan yet.', details: {} } }] });
    renderRoutes([{ path: '/', element: <DocumentPage /> }]);
    expect(await screen.findByText('No document yet')).toBeInTheDocument();
  });
});
