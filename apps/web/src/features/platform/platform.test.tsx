import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthPage } from '@/features/owner/HealthPage';
import { stopViewAs, startViewAs, viewAsHeaders } from '@/lib/view-as';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { AnnouncementBanner, ViewAsBanner } from './Banners';

afterEach(() => {
  vi.unstubAllGlobals();
  stopViewAs();
  localStorage.clear();
});

const me = { ...baseMe, state: 'active', user: { id: 'u1', org_role: 'admin' }, org: { id: 'o1', name: 'Acme' } };

describe('AnnouncementBanner', () => {
  it('shows active announcements and remembers dismissals', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/announcements': [
        {
          id: 'a1',
          title: 'Maintenance on Sunday',
          body: '02:00–03:00 UTC',
          level: 'warning',
          link: '/app/settings',
          starts_at: null,
          ends_at: null,
          active: true,
          created_at: '2026-09-30T10:00:00Z',
        },
      ],
    });
    const { unmount } = renderRoutes([{ path: '/', element: <AnnouncementBanner /> }]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Maintenance on Sunday');
    await userEvent.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();
    renderRoutes([{ path: '/', element: <AnnouncementBanner /> }]);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Maintenance on Sunday')).not.toBeInTheDocument();
  });
});

describe('read-only org view', () => {
  it('sends the grant header and shows a banner with an exit', async () => {
    expect(viewAsHeaders()).toEqual({});
    startViewAs({ token: 'grant-token', orgId: 'o1', orgName: 'Acme Corp', expiresAt: Date.now() + 60_000 });
    expect(viewAsHeaders()).toEqual({ 'X-KloudRecon-View-As': 'grant-token' });
    mockApi({ 'GET /api/v1/me': me });
    renderRoutes([
      { path: '/', element: <ViewAsBanner /> },
      { path: '/owner/orgs/:id', element: <p>Org detail</p> },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Read-only view of Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Exit view' }));
    expect(await screen.findByText('Org detail')).toBeInTheDocument();
    expect(viewAsHeaders()).toEqual({});
  });

  it('ignores an expired grant', () => {
    startViewAs({ token: 't', orgId: 'o1', orgName: 'Acme', expiresAt: Date.now() - 1 });
    expect(viewAsHeaders()).toEqual({});
  });
});

describe('HealthPage', () => {
  it('shows queue, dead jobs and stage durations', async () => {
    mockApi({
      'GET /api/v1/me': { ...baseMe, state: 'active', is_platform_owner: true },
      'GET /api/v1/owner/health': {
        process: {
          hostname: 'vm-kloudrecon-prod',
          cpu_percent: 12.5,
          memory_percent: 41,
          memory_used_bytes: 3_000_000_000,
          memory_total_bytes: 8_000_000_000,
          disks: [{ label: 'system', path: '/', percent: 30, free_bytes: 40_000_000_000, total_bytes: 64_000_000_000 }],
          db_size_bytes: 250_000_000,
          uptime_seconds: 3600,
        },
        jobs: { queued: 2, running: 1, succeeded: 40, failed: 0, dead: 1 },
        jobs_by_type: [],
        dead_jobs: [
          {
            id: 'j1',
            type: 'notify.email',
            org_id: null,
            org_name: 'Acme Corp',
            attempts: 5,
            last_error: 'SMTP unavailable',
            created_at: '2026-09-30T10:00:00Z',
            finished_at: '2026-09-30T10:05:00Z',
          },
        ],
        workers: [],
        scans_7d: { succeeded: 9, failed: 1 },
        stage_durations: [{ stage: 'inventory', title: 'Inventory', runs: 10, failed: 0, avg_ms: 1500, p95_ms: 2400 }],
        azure_requests_7d: 1200,
        azure_throttled_7d: 3,
        ai_calls_7d: 42,
        ai_errors_7d: { rate_limited: 2 },
        ai_avg_latency_ms: 900,
      },
    });
    renderRoutes([{ path: '/', element: <HealthPage /> }]);
    expect(await screen.findByText('notify.email')).toBeInTheDocument();
    expect(screen.getByText('SMTP unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    expect(screen.getByText(/3 Azure 429s of 1,200 calls/)).toBeInTheDocument();
    expect(screen.getByText(/rate_limited 2/)).toBeInTheDocument();
  });
});
