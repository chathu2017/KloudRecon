import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseMe, mockApi, renderRoutes } from '@/test/utils';
import { ReportsPage } from './ReportsPage';

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

const report = (over: Record<string, unknown>) => ({
  id: 'r1',
  type: 'executive',
  title: 'Executive Summary',
  params: {},
  status: 'ready',
  format: 'pdf',
  size_bytes: 120000,
  pages: 1,
  error: null,
  scan_id: 's1',
  schedule_id: null,
  created_at: '2026-10-04T10:00:00Z',
  finished_at: '2026-10-04T10:01:00Z',
  ...over,
});

describe('ReportsPage', () => {
  it('offers the audit report as Word and sends the approval names', async () => {
    const calls = mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/reports': [],
      'GET /api/v1/reports/schedules': [],
      'GET /api/v1/compliance/frameworks': [],
      'POST /api/v1/reports': report({ id: 'r2', type: 'audit', title: 'Azure Audit Report', status: 'queued', format: 'docx', pages: null }),
    });
    renderRoutes([{ path: '/', element: <ReportsPage /> }]);
    await userEvent.click(await screen.findByRole('button', { name: /Audit report \(Word\)/ }));
    expect(await screen.findByText(/Page 2 of the document is the approval page/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Prepared by'), 'Alex Admin');
    await userEvent.type(screen.getByLabelText('Report approved by'), '  Dana Reyes ');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    const sent = async (): Promise<unknown> => {
      for (const [input, init] of calls.mock.calls as [RequestInfo | URL, RequestInit | undefined][]) {
        const request = input instanceof Request ? input : null;
        const method = (request?.method ?? init?.method ?? 'GET').toUpperCase();
        if (method !== 'POST') continue;
        const raw = request ? await request.clone().text() : typeof init?.body === 'string' ? init.body : 'null';
        return JSON.parse(raw) as unknown;
      }
      return null;
    };
    await waitFor(async () => expect(await sent()).not.toBeNull());
    // the empty "Reviewed by" is left out: it prints as a blank line
    expect(await sent()).toEqual({ type: 'audit', prepared_by: 'Alex Admin', approved_by: 'Dana Reyes' });
  });

  it('labels the download by format', async () => {
    mockApi({
      'GET /api/v1/me': me,
      'GET /api/v1/reports': [report({}), report({ id: 'r2', type: 'audit', title: 'Azure Audit Report', format: 'docx', pages: null, size_bytes: 2200000 })],
      'GET /api/v1/reports/schedules': [],
    });
    renderRoutes([{ path: '/', element: <ReportsPage /> }]);
    expect(await screen.findByRole('button', { name: 'Download Azure Audit Report' })).toHaveTextContent('Word');
    expect(screen.getByRole('button', { name: 'Download Executive Summary' })).toHaveTextContent('PDF');
  });
});
