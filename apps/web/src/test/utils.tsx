import { render, type RenderResult } from '@testing-library/react';
import type * as React from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { makeQueryClient } from '@/app/query-client';
import type { AuthAdapter, SignInOptions } from '@/lib/auth/adapters';

/** In-memory auth adapter for tests. */
export class FakeAdapter implements AuthAdapter {
  readonly mode = 'dev' as const;
  signedIn: boolean;
  // The argument is recorded by the mock (toHaveBeenCalledWith); the fake ignores it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signIn = vi.fn((_options?: SignInOptions) => {
    this.signedIn = true;
    return Promise.resolve();
  });
  signOut = vi.fn(() => {
    this.signedIn = false;
    return Promise.resolve();
  });

  constructor(signedIn = true) {
    this.signedIn = signedIn;
  }

  init(): Promise<void> {
    return Promise.resolve();
  }
  isSignedIn(): boolean {
    return this.signedIn;
  }
  getToken(): Promise<string | null> {
    return Promise.resolve(this.signedIn ? 'test-token' : null);
  }
  displayEmail(): string | null {
    return null;
  }
}

type Handler = (url: URL, init: RequestInit | undefined) => unknown;

/** Mock fetch by "METHOD /path" → JSON body (or [status, body]). */
export function mockApi(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const href = request ? request.url : input instanceof URL ? input.href : (input as string);
    const url = new URL(href, 'http://localhost');
    const method = (request?.method ?? init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    const entry = routes[key] ?? routes[url.pathname];
    if (entry === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'not_found', message: key } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    const value: unknown = typeof entry === 'function' ? (entry as Handler)(url, init) : entry;
    const tuple = Array.isArray(value) && typeof value[0] === 'number';
    const status = tuple ? (value as [number, unknown])[0] : 200;
    const body = tuple ? (value as [number, unknown])[1] : value;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderRoutes(
  routes: RouteObject[],
  { path = '/', adapter = new FakeAdapter() }: { path?: string; adapter?: AuthAdapter } = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders adapter={adapter} queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}

export function Stub({ label }: { label: string }): React.ReactElement {
  return <div>{label}</div>;
}

export const baseMe = {
  email: 'jane@contoso.test',
  name: 'Jane Doe',
  is_platform_owner: false,
  user: null,
  org: null,
  plan: null,
  rejection_reason: null,
};
