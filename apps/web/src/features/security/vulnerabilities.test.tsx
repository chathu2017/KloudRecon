import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { VulnerabilitiesPage } from './VulnerabilitiesPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const VM = '/subscriptions/s1/resourcegroups/rg/providers/microsoft.compute/virtualmachines/';

const machine = {
  arm_id: `${VM}vm-web`,
  name: 'vm-web',
  resource_type: 'microsoft.compute/virtualmachines',
  os: 'ubuntu 24.04 lts server',
  image_date: '2026-01-30',
  image_age_days: 247,
  patch_mode: 'ImageDefault',
  assessment_mode: 'ImageDefault',
  assessed: 'never',
  last_assessed: null,
  critical: 0,
  security: 0,
  other: 0,
  reboot_pending: false,
  exposed: true,
  management_open: true,
  password_sign_in: false,
  priority: 60,
  level: 'high',
  reasons: ['never checked for missing updates', 'management port open to the internet'],
  patches: [],
};

const patched = {
  ...machine,
  arm_id: `${VM}vm-jump`,
  name: 'vm-jump',
  assessed: 'current',
  last_assessed: '2026-10-03T06:00:00Z',
  critical: 2,
  security: 3,
  reboot_pending: true,
  priority: 80,
  level: 'critical',
  reasons: ['2 critical patches missing'],
  patches: [
    { name: '2026-09 Cumulative Update (KB5043080)', kb: '5043080', version: null, classification: 'Critical', severity: 'Critical', published: '2026-09-10' },
    { name: 'openssl', kb: null, version: '3.0.13-0ubuntu3.6', classification: 'Security', severity: null, published: null },
  ],
};

const basic = {
  patch_data: true,
  summary: {
    machines: 2,
    assessed: 1,
    stale: 0,
    never_assessed: 1,
    machines_with_gaps: 1,
    critical_patches: 2,
    security_patches: 3,
    reboot_pending: 1,
    end_of_support: 1,
    ending_soon: 0,
    unpinned_images: 1,
  },
  machines: [patched, machine],
  lifecycle: [
    {
      arm_id: `${VM}vm-old`,
      name: 'vm-old',
      resource_type: 'microsoft.compute/virtualmachines',
      software: 'Ubuntu 18.04 LTS',
      end_of_support: '2023-05-31',
      days_left: -1222,
      status: 'ended',
      hint: 'Rebuild on Ubuntu 24.04 LTS.',
      source_url: 'https://ubuntu.com/about/release-cycle',
      verified: false,
      exposed: true,
    },
  ],
  images: [{ arm_id: '/subscriptions/s1/resourcegroups/rg/providers/microsoft.app/containerapps/frontend', name: 'frontend', container: 'frontend', image: 'acr.azurecr.io/frontend:latest', issue: 'latest tag', exposed: true }],
};

const me = { ...baseMe, state: 'active' };
const empty = { items: [], by_cve: [], summary: { total: 0, critical: 0, exploitable: 0, exposed: 0, resources: 0 } };

describe('VulnerabilitiesPage', () => {
  it('shows the basic assessment without Defender, with the notice about what Defender adds', async () => {
    mockApi({ 'GET /api/v1/me': me, 'GET /api/v1/security/vulnerabilities': { ...empty, defender_enabled: false, basic } });
    renderRoutes([{ path: '/', element: <VulnerabilitiesPage /> }]);
    expect(await screen.findByText('This is the basic assessment.')).toBeInTheDocument();
    expect(screen.queryByText('Enable Defender to see vulnerabilities')).not.toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument(); // machines checked
    expect(screen.getByText('1 never checked')).toBeInTheDocument();
    // never assessed is unknown, not clean, and comes with the free fix
    expect(screen.getByText('Never checked')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/Turn on periodic assessment \(free\)/)).toBeInTheDocument();
    // missing patches expand to the patch list
    await userEvent.click(screen.getByRole('button', { name: /2 critical, 3 security/ }));
    expect(screen.getByText('2026-09 Cumulative Update (KB5043080)')).toBeInTheDocument();
    expect(screen.getByText('Restart pending')).toBeInTheDocument();
    // the other blocks
    await userEvent.click(screen.getByRole('tab', { name: 'Software lifecycle' }));
    expect(await screen.findByText('Ubuntu 18.04 LTS')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText('date not verified')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Container images' }));
    expect(await screen.findByText('acr.azurecr.io/frontend:latest')).toBeInTheDocument();
    expect(screen.getByText('Uses latest')).toBeInTheDocument();
  });

  it('opens on Defender CVEs when Defender is on and keeps the basic tabs', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/security/vulnerabilities': {
        defender_enabled: true,
        basic,
        items: [],
        by_cve: [{ cve: 'CVE-2026-0001', title: 'Remote code execution in openssl', cvss: 9.8, severity: 'high', exploitable: true, resources: 2 }],
        summary: { total: 1, critical: 1, exploitable: 1, exposed: 1, resources: 2 },
      },
    });
    renderRoutes([{ path: '/', element: <VulnerabilitiesPage /> }]);
    expect(await screen.findByText('CVE-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('This is the basic assessment.')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Machines and patches' })).toBeInTheDocument();
  });

  it('asks for a scan when the scan is older than the assessment', async () => {
    mockApi({ 'GET /api/v1/me': me, 'GET /api/v1/security/vulnerabilities': { ...empty, defender_enabled: false, basic: null } });
    renderRoutes([{ path: '/', element: <VulnerabilitiesPage /> }]);
    expect(await screen.findByText('Run a scan to build the assessment')).toBeInTheDocument();
  });
});
