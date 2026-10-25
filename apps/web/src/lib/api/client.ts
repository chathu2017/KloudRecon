import createClient, { type Middleware } from 'openapi-fetch';
import { env } from '@/lib/env';
import { viewAsHeaders } from '@/lib/view-as';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];

/** Error thrown for non-2xx responses, carrying the API's error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter = () => Promise.resolve(null);

/** Called by the auth layer so every request carries the bearer token. */
export function setTokenGetter(getter: TokenGetter): void {
  tokenGetter = getter;
}

export function getAccessToken(): Promise<string | null> {
  return tokenGetter();
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await tokenGetter();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(viewAsHeaders())) request.headers.set(k, v);
    return request;
  },
};

export const api = createClient<paths>({
  // Same origin locally (Vite proxies /api); VITE_API_BASE_URL in production.
  baseUrl: env.apiBaseUrl || window.location.origin,
  // Resolve fetch per call (not at import time) so it can be instrumented or stubbed.
  fetch: (request: Request) => globalThis.fetch(request),
});
api.use(authMiddleware);

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

function isEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export function toApiError(status: number, body: unknown): ApiError {
  if (isEnvelope(body) && body.error) {
    return new ApiError(
      status,
      body.error.code ?? 'error',
      body.error.message ?? 'Request failed.',
      body.error.details ?? {},
    );
  }
  return new ApiError(status, 'network_error', 'The service is not reachable. Try again shortly.');
}

/** Resolve an openapi-fetch call to its data or throw an ApiError. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch {
    throw new ApiError(0, 'network_error', 'The service is not reachable. Try again shortly.');
  }
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.response.status, result.error);
  }
  return result.data as T;
}

/** Friendly field errors from a 422 envelope: { fieldName: message }. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'validation_error') return {};
  const list = error.details.errors;
  const out: Record<string, string> = {};
  if (Array.isArray(list)) {
    for (const item of list as { loc?: unknown[]; msg?: string }[]) {
      const field = item.loc?.[item.loc.length - 1];
      if (typeof field === 'string' && item.msg)
        out[field] = item.msg.replace(/^Value error, /, '');
    }
  }
  return out;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
