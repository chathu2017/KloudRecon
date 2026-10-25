import { describe, expect, it } from 'vitest';
import { onboardingSchema } from '@/features/account/onboarding-schema';
import { ApiError, fieldErrors, toApiError, unwrap } from './api/client';
import { formatBytes, formatDuration, formatMoney, timeAgo, titleCase } from './format';
import { parseEvent } from './sse';
import { resolveTheme } from './theme';
import { isSafeInternalPath } from './url';

describe('format', () => {
  it('formats durations compactly', () => {
    expect(formatDuration(59)).toBe('0m');
    expect(formatDuration(3 * 3600 + 15 * 60)).toBe('3h 15m');
    expect(formatDuration(2 * 86400 + 5 * 3600)).toBe('2d 5h');
  });

  it('formats money and custom pricing', () => {
    expect(formatMoney('10', 'USD')).toContain('10');
    expect(formatMoney(null)).toBe('Custom');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(null)).toBe('—');
  });

  it('describes relative time', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(timeAgo('2026-01-01T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-01-01T10:00:00Z', now)).toMatch(/2 hours ago/);
  });

  it('title-cases identifiers', () => {
    expect(titleCase('pending_approval')).toBe('Pending Approval');
  });
});

describe('api client', () => {
  it('reads the error envelope', () => {
    const err = toApiError(403, {
      error: { code: 'account_pending_approval', message: 'Not active', details: {} },
    });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('account_pending_approval');
  });

  it('maps unknown bodies to a network error', () => {
    expect(toApiError(502, 'bad gateway').code).toBe('network_error');
  });

  it('extracts field errors from a 422', () => {
    const err = new ApiError(422, 'validation_error', 'invalid', {
      errors: [{ loc: ['body', 'phone'], msg: 'Value error, Phone may contain digits only.' }],
    });
    expect(fieldErrors(err)).toEqual({ phone: 'Phone may contain digits only.' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });

  it('unwrap throws ApiError on failure and returns data on success', async () => {
    const ok = await unwrap(
      Promise.resolve({ data: { a: 1 }, response: new Response(null, { status: 200 }) }),
    );
    expect(ok).toEqual({ a: 1 });
    await expect(
      unwrap(
        Promise.resolve({
          error: { error: { code: 'forbidden', message: 'No' } },
          response: new Response(null, { status: 403 }),
        }),
      ),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(unwrap(Promise.reject(new TypeError('offline')))).rejects.toMatchObject({
      code: 'network_error',
    });
  });
});

describe('sse', () => {
  it('parses events and ignores junk', () => {
    expect(parseEvent('{"id":1,"type":"notification.created","payload":{}}')?.type).toBe(
      'notification.created',
    );
    expect(parseEvent('not json')).toBeNull();
    expect(parseEvent('{"id":1}')).toBeNull();
  });
});

describe('theme', () => {
  it('resolves explicit preferences', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('system')).toBe('light'); // matchMedia stub → light
  });
});

describe('onboarding schema', () => {
  const valid = {
    name: 'Jane',
    job_title: 'CTO',
    company: 'Contoso',
    country: 'Germany',
    company_size: '51-200' as const,
    industry: '',
    phone: '+49 30 1234',
    use_case: 'Security review before an audit.',
    accept_terms: true,
  };

  it('accepts a complete profile', () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });

  it('requires terms and a meaningful use case', () => {
    expect(onboardingSchema.safeParse({ ...valid, accept_terms: false }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...valid, use_case: 'short' }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...valid, phone: 'call me' }).success).toBe(false);
  });
});

describe('isSafeInternalPath', () => {
  it('accepts app paths', () => {
    expect(isSafeInternalPath('/app/settings/team?tab=1')).toBe(true);
    expect(isSafeInternalPath('/invite/abc')).toBe(true);
  });

  it('rejects open-redirect tricks', () => {
    const bad = ['//evil.test', '/\\evil.test', 'https://evil.test', 'evil', '', null, '/a\nb'];
    for (const value of bad) {
      expect(isSafeInternalPath(value)).toBe(false);
    }
  });
});
