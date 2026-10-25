import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/pages/auth/LoginPage';
import { baseMe, FakeAdapter, mockApi, renderRoutes, Stub } from '@/test/utils';
import { homeFor } from './home';
import { RequireSignedIn, RequireState } from './guards';

afterEach(() => {
  vi.unstubAllGlobals();
});

const gatedRoutes = [
  {
    element: <RequireSignedIn />,
    children: [
      {
        element: <RequireState states={['active']} customerOnly />,
        children: [{ path: '/app', element: <Stub label="customer app" /> }],
      },
      {
        element: <RequireState states={['active']} ownerOnly />,
        children: [{ path: '/owner', element: <Stub label="owner console" /> }],
      },
      { path: '/under-review', element: <Stub label="under review" /> },
      { path: '/onboarding', element: <Stub label="onboarding" /> },
      { path: '/rejected', element: <Stub label="rejected" /> },
    ],
  },
  { path: '/login', element: <Stub label="login page" /> },
];

describe('homeFor', () => {
  it('maps every account state to its page', () => {
    expect(homeFor({ state: 'profile_incomplete', is_platform_owner: false })).toBe('/onboarding');
    expect(homeFor({ state: 'pending_approval', is_platform_owner: false })).toBe('/under-review');
    expect(homeFor({ state: 'rejected', is_platform_owner: false })).toBe('/rejected');
    expect(homeFor({ state: 'suspended', is_platform_owner: false })).toBe('/rejected');
    expect(homeFor({ state: 'active', is_platform_owner: false })).toBe('/app');
    expect(homeFor({ state: 'active', is_platform_owner: true })).toBe('/owner');
  });
});

describe('route guards (client mirror of the access gate)', () => {
  it('sends anonymous visitors to login', async () => {
    mockApi({});
    renderRoutes(gatedRoutes, { path: '/app', adapter: new FakeAdapter(false) });
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('keeps pending accounts out of the app', async () => {
    mockApi({ 'GET /api/v1/me': { ...baseMe, state: 'pending_approval' } });
    renderRoutes(gatedRoutes, { path: '/app' });
    expect(await screen.findByText('under review')).toBeInTheDocument();
  });

  it('sends new identities to onboarding', async () => {
    mockApi({ 'GET /api/v1/me': { ...baseMe, state: 'profile_incomplete' } });
    renderRoutes(gatedRoutes, { path: '/owner' });
    expect(await screen.findByText('onboarding')).toBeInTheDocument();
  });

  it('lets active customers in but not into the owner console', async () => {
    mockApi({ 'GET /api/v1/me': { ...baseMe, state: 'active' } });
    const { router } = renderRoutes(gatedRoutes, { path: '/app' });
    expect(await screen.findByText('customer app')).toBeInTheDocument();
    await router.navigate('/owner');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
    expect(screen.queryByText('owner console')).not.toBeInTheDocument();
  });

  it('lets the platform owner into the owner console', async () => {
    mockApi({ 'GET /api/v1/me': { ...baseMe, state: 'active', is_platform_owner: true } });
    renderRoutes(gatedRoutes, { path: '/owner' });
    expect(await screen.findByText('owner console')).toBeInTheDocument();
  });
});

describe('dev login page', () => {
  it('lists seeded users and signs in with one click', async () => {
    mockApi({
      'GET /api/v1/auth/dev/users': [
        { email: 'owner@local.test', label: 'Platform Owner', description: 'Owner console' },
        { email: 'admin@acme.test', label: 'Acme Corp admin', description: 'Active customer' },
      ],
    });
    const adapter = new FakeAdapter(false);
    renderRoutes(
      [
        { path: '/login', element: <LoginPage /> },
        { path: '/start', element: <Stub label="start" /> },
      ],
      { path: '/login', adapter },
    );
    await userEvent.click(await screen.findByText('Platform Owner'));
    await waitFor(() => {
      expect(adapter.signIn).toHaveBeenCalledWith({ email: 'owner@local.test', name: '' });
    });
    expect(await screen.findByText('start')).toBeInTheDocument();
  });

  it('validates a custom email before signing in', async () => {
    mockApi({ 'GET /api/v1/auth/dev/users': [] });
    const adapter = new FakeAdapter(false);
    renderRoutes([{ path: '/login', element: <LoginPage /> }], { path: '/login', adapter });
    await userEvent.type(await screen.findByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(adapter.signIn).not.toHaveBeenCalled();
  });
});
