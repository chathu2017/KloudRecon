import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { AttackPathsPage } from './AttackPathsPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const VM = '/subscriptions/s1/resourcegroups/rg/providers/microsoft.compute/virtualmachines/vm-web';
const SQL = '/subscriptions/s1/resourcegroups/rg/providers/microsoft.sql/servers/sql-app';

const remote = {
  id: 'p-remote',
  key: 'k1',
  score: 60,
  severity: 'high',
  entry_arm_id: VM,
  target_arm_id: VM,
  title: 'vm-web → remote control',
  summary: 'Internet → vm-web (SSH open to the internet) → control of the machine.',
  path: {
    kind: 'remote',
    nodes: [
      { id: 'internet', kind: 'internet', label: 'Internet' },
      { id: VM, kind: 'resource', label: 'vm-web', type: 'microsoft.compute/virtualmachines', detail: 'SSH open to the internet' },
      { id: `control:${VM}`, kind: 'target', label: 'Control of vm-web', type: 'microsoft.compute/virtualmachines' },
    ],
    edges: [],
  },
  factors: {
    kind: 'remote',
    exposure: 1,
    exploitability: 0.6,
    privilege: 0.8,
    sensitivity: 0.7,
    exploitability_reasons: ['weak configuration: net-vm-management-exposed'],
    privilege_detail: 'administrator on the machine after sign-in',
  },
  reachable: [],
  first_seen: null,
};

const data = {
  ...remote,
  id: 'p-data',
  key: 'k2',
  score: 52,
  severity: 'medium',
  entry_arm_id: SQL,
  target_arm_id: SQL,
  title: 'Internet → sql-app',
  summary: 'Internet → sql-app (SQL Server reachable from the internet).',
  path: {
    kind: 'data',
    nodes: [
      { id: 'internet', kind: 'internet', label: 'Internet' },
      { id: SQL, kind: 'target', label: 'sql-app', type: 'microsoft.sql/servers' },
    ],
    edges: [],
  },
  factors: { kind: 'data', exposure: 0.9, exploitability: 0.5, privilege: 0.6, sensitivity: 0.95, exploitability_reasons: [], privilege_detail: 'a valid credential is still required' },
};

const me = { ...baseMe, state: 'active' };
const exposure = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ arm_id: `a${i}` })), by_kind: {}, by_port: [] });

describe('AttackPathsPage', () => {
  it('lists remote access and exposed data paths with advice for each kind', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/security/attack-paths': [remote, data],
      'GET /api/v1/security/exposure': exposure(3),
    });
    renderRoutes([{ path: '/', element: <AttackPathsPage /> }]);
    expect(await screen.findByText('2 paths found')).toBeInTheDocument();
    expect(screen.getByText('Remote access')).toBeInTheDocument();
    expect(screen.getByText('Exposed data')).toBeInTheDocument();
    // the first path is selected: advice for remote access, not for identities
    expect(screen.getByText(/Azure Bastion or just-in-time access/)).toBeInTheDocument();
    expect(screen.queryByText(/Reduce the identity/)).not.toBeInTheDocument();
    expect(screen.getByText('Privilege: administrator on the machine after sign-in')).toBeInTheDocument();
    expect(screen.getAllByText('Control of vm-web').length).toBeGreaterThan(0);
  });

  it('does not say "nice" when resources are exposed but no path is listed', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/security/attack-paths': [],
      'GET /api/v1/security/exposure': exposure(9),
    });
    renderRoutes([{ path: '/', element: <AttackPathsPage /> }]);
    expect(await screen.findByText('No attack paths, but resources are exposed')).toBeInTheDocument();
    expect(screen.getByText(/9 resources are reachable from the internet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review internet exposure' })).toHaveAttribute('href', '/app/security/exposure');
  });
});
