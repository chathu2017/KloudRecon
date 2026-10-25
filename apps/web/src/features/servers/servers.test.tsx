import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { asSummary, gigabytes } from './health';
import { ServerDetailPage } from './ServerDetailPage';
import { ServerHealthPage } from './ServerHealthPage';

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

const options = {
  windows: [{ key: 'windows-server', label: 'Windows Server', versions: [{ key: '2022', label: 'Windows Server 2022', end_of_support: '2031-10-14' }] }],
  linux: [
    { key: 'ubuntu', label: 'Ubuntu', versions: [{ key: '24.04', label: 'Ubuntu 24.04 LTS', end_of_support: '2029-04-30' }] },
    { key: 'rhel', label: 'Red Hat Enterprise Linux', versions: [{ key: '9', label: 'RHEL 9', end_of_support: '2032-05-31' }, { key: '8', label: 'RHEL 8', end_of_support: '2029-05-31' }] },
  ],
};

const latest = { id: 'c1', created_at: '2026-10-04T10:01:00Z', collected_at: '2026-10-04T10:00:00Z', score: 41, grade: 'D', status: 'critical', counts: { critical: 1, high: 2, medium: 1, low: 0 }, complete: true };
const web = { id: 's1', name: 'web01', platform: 'linux', os_family: 'ubuntu', os_version: '24.04', os_label: 'Ubuntu 24.04 LTS', notes: '', created_at: '2026-10-01T00:00:00Z', checks: 1, latest };
const win = { id: 's2', name: 'srv-app01', platform: 'windows', os_family: 'windows-server', os_version: '2022', os_label: 'Windows Server 2022', notes: '', created_at: '2026-10-01T00:00:00Z', checks: 0, latest: null };

const summary = {
  platform: 'linux',
  collected_at: '2026-10-04T10:00:00Z',
  complete: false,
  score: 41,
  grade: 'D',
  status: 'critical',
  counts: { critical: 1, high: 2, medium: 1, low: 0 },
  os: { name: 'Ubuntu 24.04.1 LTS', version: '24.04', kernel: '6.8.0-45-generic', hostname: 'web01.corp', architecture: 'x86_64', uptime_days: 212.4, virtualization: 'microsoft', lifecycle: { label: 'Ubuntu 24.04 LTS', end_of_support: '2029-04-30', days_left: 900 } },
  cpu: { model: 'Xeon', cores: 4, load_pct: 35 },
  memory: { total: 8 * 1024 ** 3, available: 1024 ** 3, used_pct: 87.5, swap_total: 2 * 1024 ** 3, swap_used_pct: 10 },
  disks: [{ mount: '/', filesystem: 'ext4', size: 100 * 1024 ** 3, free: 3 * 1024 ** 3, used_pct: 97, inodes_pct: 20 }],
  patches: { checked: true, pending: 12, security: 5, critical: 1, last_patched: '2026-03-01', days_since_patch: 217, reboot_pending: true, items: [{ name: 'openssl', id: '3.0.13-0ubuntu3.6', severity: 'Security', security: true, cves: ['CVE-2026-1111'] }] },
  vulnerabilities: [{ id: 'CVE-2026-1111', severity: 'Security', source: 'openssl' }],
  logs: { critical: 1, errors: 620, warnings: 80, top: [{ source: 'nginx', count: 14, last: '2026-10-03T10:00:00+0000', message: 'upstream timed out' }] },
  services: { failed: [{ name: 'backup.service', display_name: 'backup.service', state: 'failed' }] },
  security: [
    { key: 'ssh-root', label: 'SSH root login disabled', status: 'fail', detail: 'yes' },
    { key: 'firewall', label: 'Host firewall active', status: 'unknown', detail: '' },
  ],
  network: { listening: [{ protocol: 'tcp', port: 22, address: '0.0.0.0', process: '' }] },
  findings: [
    { id: 'disk-/', severity: 'critical', area: 'Storage', title: 'Disk / is 97% full', detail: '3.0 GB free of 100.0 GB.', recommendation: 'Free space or extend the volume now.' },
    { id: 'ssh-root', severity: 'high', area: 'Security', title: 'SSH allows root to sign in with a password', detail: 'Attackers try root first.', recommendation: 'Set PermitRootLogin no.' },
  ],
};

const detail = { ...web, check: { id: 'c1', server_id: 's1', created_at: latest.created_at, collected_at: latest.collected_at, score: 41, status: 'critical', summary }, history: [latest] };
const script = { language: 'bash', filename: 'kloudrecon-health.sh', script: '#!/usr/bin/env bash\n# Server: web01\necho collect', steps: ['Save the script on the server.', 'Run it as root.', 'Copy the file.', 'Paste it below.'] };

async function posted(calls: ReturnType<typeof mockApi>, path: string): Promise<unknown> {
  for (const [input, init] of calls.mock.calls as [RequestInfo | URL, RequestInit | undefined][]) {
    const request = input instanceof Request ? input : null;
    const method = (request?.method ?? init?.method ?? 'GET').toUpperCase();
    const url = request ? request.url : input instanceof URL ? input.href : typeof input === 'string' ? input : '';
    if (method !== 'POST' || !url.endsWith(path)) continue;
    const raw = request ? await request.clone().text() : typeof init?.body === 'string' ? init.body : 'null';
    return JSON.parse(raw) as unknown;
  }
  return null;
}

describe('Server health', () => {
  it('lists Windows and Linux servers in two tabs and adds a Linux server with distribution and version', async () => {
    const calls = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/servers': [web, win],
      'GET /api/v1/servers/options': options,
      'POST /api/v1/servers': [201, { ...web, id: 's3', name: 'db01', latest: null }],
    });
    renderRoutes([{ path: '/', element: <ServerHealthPage /> }]);
    // Windows tab first: the server that has no check yet
    expect(await screen.findByRole('link', { name: 'srv-app01' })).toBeInTheDocument();
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Linux servers/ }));
    expect(await screen.findByRole('link', { name: 'web01' })).toHaveAttribute('href', '/app/server-health/s1');
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('1 critical')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add Linux server/ }));
    const add = screen.getByRole('button', { name: 'Add server' });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Server name/), 'db01');
    await userEvent.selectOptions(screen.getByLabelText('Distribution'), 'rhel');
    await userEvent.selectOptions(screen.getByLabelText('Version'), '8');
    await userEvent.click(add);
    await waitFor(async () => expect(await posted(calls, '/api/v1/servers')).not.toBeNull());
    expect(await posted(calls, '/api/v1/servers')).toEqual({ name: 'db01', platform: 'linux', os_family: 'rhel', os_version: '8', notes: '' });
  });

  it('shows the health report, the script and saves pasted output', async () => {
    const calls = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/servers/s1': detail,
      'GET /api/v1/servers/s1/script': script,
      'POST /api/v1/servers/s1/checks': [201, detail],
    });
    renderRoutes([{ path: '/app/server-health/:serverId', element: <ServerDetailPage /> }], { path: '/app/server-health/s1' });
    expect(await screen.findByText('Ubuntu 24.04.1 LTS')).toBeInTheDocument();
    expect(screen.getByText(/Partial: not run as root/)).toBeInTheDocument();
    expect(screen.getByText('Disk / is 97% full')).toBeInTheDocument();
    expect(screen.getByText('Set PermitRootLogin no.')).toBeInTheDocument();
    expect(screen.getByText('212 days')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }));
    expect(await screen.findByRole('link', { name: 'CVE-2026-1111' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Security settings' }));
    expect(await screen.findByText('Failed: yes')).toBeInTheDocument();
    expect(screen.getByText('Could not be checked')).toBeInTheDocument();
    // the script and the paste box
    expect(await screen.findByText(/# Server: web01/)).toBeInTheDocument();
    expect(screen.getByText('Run it as root.')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /Save and build report/ });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Paste the output here/));
    await userEvent.paste('{"schema":"kloudrecon.linux.v1"}');
    await userEvent.click(save);
    await waitFor(async () => expect(await posted(calls, '/checks')).toEqual({ output: '{"schema":"kloudrecon.linux.v1"}' }));
  });

  it('reads stored summaries defensively', () => {
    expect(asSummary(null)).toBeNull();
    expect(asSummary({ score: 'x' })).toBeNull();
    expect(asSummary(summary)?.status).toBe('critical');
    expect(gigabytes(8 * 1024 ** 3)).toBe('8.0 GB');
    expect(gigabytes(500 * 1024 ** 3)).toBe('500 GB');
    expect(gigabytes(0)).toBe('—');
  });
});
