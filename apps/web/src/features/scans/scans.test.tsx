import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/misc';
import { useUi } from '@/lib/ui-store';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { ScanControl } from './ScanControl';
import { ScanProgressDrawer } from './ScanProgressDrawer';

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => {
    useUi.setState({ scanDrawerId: null, asOfScanId: null });
  });
});

const me = {
  ...baseMe,
  state: 'active',
  user: {
    id: 'u1',
    org_id: 'o1',
    email: 'a@b.test',
    name: 'A',
    job_title: null,
    phone: null,
    org_role: 'member',
    platform_role: null,
    status: 'active',
    last_login_at: null,
    created_at: '2026-09-01T00:00:00Z',
    notification_prefs: {},
  },
};

const scan = {
  id: 's1',
  connection_id: 'c1',
  connection_name: 'Contoso Demo tenant',
  sequence: 4,
  trigger: 'manual',
  status: 'partial',
  stage: null,
  progress: 100,
  started_at: '2026-09-26T10:00:00Z',
  finished_at: '2026-09-26T10:01:00Z',
  created_at: '2026-09-26T10:00:00Z',
  stats: {
    resources: 589,
    subscriptions: 4,
    duration_ms: 42000,
    changes: { created: 3, deleted: 1, modified: 5, risky: 2, baseline: false },
  },
  error: { partial: ['Changes & Activity Log: The Activity Log could not be read.'] },
  stages: [
    {
      stage: 'authenticate',
      position: 0,
      title: 'Authenticate',
      optional: false,
      status: 'succeeded',
      started_at: null,
      finished_at: null,
      items: 0,
      message: 'Signed in.',
    },
    {
      stage: 'inventory',
      position: 2,
      title: 'Inventory (Resource Graph)',
      optional: false,
      status: 'succeeded',
      started_at: null,
      finished_at: null,
      items: 589,
      message: '589 resources',
    },
    {
      stage: 'changes',
      position: 5,
      title: 'Changes & Activity Log',
      optional: true,
      status: 'failed',
      started_at: null,
      finished_at: null,
      items: null,
      message: 'The Activity Log could not be read.',
    },
  ],
};

const connection = { id: 'c1', name: 'Contoso Demo tenant', status: 'valid' };

describe('ScanProgressDrawer', () => {
  it('shows the stage checklist, stats and partial reason', async () => {
    mockApi({ 'GET /api/v1/me': me, 'GET /api/v1/scans/s1': scan });
    act(() => {
      useUi.setState({ scanDrawerId: 's1' });
    });
    renderRoutes([{ path: '/', element: <ScanProgressDrawer /> }]);
    expect(await screen.findByText('Scan #4')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('Some optional steps did not run')).toBeInTheDocument();
    expect(screen.getByText('589', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText(': Failed')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText(/Took 42 s/)).toBeInTheDocument();
  });
});

describe('ScanControl', () => {
  it('shows live progress while a scan runs', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/connections': [connection],
      'GET /api/v1/scans': (url: URL) =>
        url.searchParams.get('status') === 'active'
          ? [{ ...scan, status: 'running', progress: 45 }]
          : [scan],
    });
    renderRoutes([
      {
        path: '/',
        element: (
          <TooltipProvider>
            <ScanControl />
          </TooltipProvider>
        ),
      },
    ]);
    expect(await screen.findByText('Scanning 45%')).toBeInTheDocument();
  });

  it('offers Scan now to members when idle', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/connections': [connection],
      'GET /api/v1/scans': (url: URL) =>
        url.searchParams.get('status') === 'active' ? [] : [scan],
    });
    renderRoutes([
      {
        path: '/',
        element: (
          <TooltipProvider>
            <ScanControl />
          </TooltipProvider>
        ),
      },
    ]);
    expect(await screen.findByRole('button', { name: /Scan now/ })).toBeInTheDocument();
  });
});
