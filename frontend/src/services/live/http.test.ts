import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ServiceError } from '../contracts';
import { createServices } from '../index';
import { api, apiAll, apiUpload, session } from './http';

/** M13: the live HTTP boundary. Failures surface as ServiceError; nothing falls back to mock data. */
const user = { id: 'u1', name: 'Asha', email: 'asha@example.test', role: 'buyer' as const };
const ok = (data: unknown, status = 200) => Response.json({ success: true, message: 'ok', data }, { status });
const fail = (status: number, body: unknown) => Response.json(body, { status });

beforeEach(() => {
  sessionStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api/');
});
afterEach(() => {
  session.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('api()', () => {
  it('sends the bearer token and JSON body to the configured base URL and unwraps the envelope', async () => {
    session.start('tok-1', user);
    const fetchMock = vi.fn().mockResolvedValue(ok({ id: 'job-1' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await api('/jobs', z.object({ id: z.string() }), { method: 'POST', body: { title: 'x' }, query: { page: 2, skip: undefined } })).toEqual({ id: 'job-1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/jobs?page=2');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-1', 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ title: 'x' }));
  });

  it.each([[400, 'VALIDATION'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'CONFLICT'], [500, 'SERVER']] as const)(
    'maps HTTP %s to %s and keeps the server message (no fallback)', async (status, code) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(status, { success: false, message: 'Quote changed' })));
      const error = await api('/x', z.unknown()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServiceError);
      expect(error).toMatchObject({ code, status });
      // 5xx details are replaced by a generic message; other statuses keep the server's.
      expect((error as Error).message).toBe(status === 500 ? 'The server could not complete the request. Please retry.' : 'Quote changed');
    });

  it('reports the first field validation error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(400, { success: false, message: 'Validation failed', errors: [{ field: 'quantity', message: 'Too small' }] })));
    await expect(api('/x', z.unknown())).rejects.toThrow('quantity: Too small');
  });

  it('a 401 on an authenticated call ends the session once and notifies listeners', async () => {
    session.start('tok-1', user);
    const listener = vi.fn();
    const stop = session.onExpired(listener);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(401, { success: false, message: 'Token expired' })));
    await expect(api('/auth/me', z.unknown())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(session.token()).toBeNull();
    expect(session.user()).toBeNull();
    await expect(api('/auth/me', z.unknown())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a 401 on login is a credential error, not a session expiry', async () => {
    session.start('tok-1', user);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(401, { success: false, message: 'Invalid email or password' })));
    await expect(api('/auth/login', z.unknown(), { method: 'POST', body: {}, auth: false })).rejects.toThrow('Invalid email or password');
    expect(session.token()).toBe('tok-1');
  });

  it('network failures and malformed responses are explicit errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/jobs', z.unknown())).rejects.toMatchObject({ code: 'NETWORK' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ id: 7 })));
    await expect(api('/jobs', z.object({ id: z.string() }))).rejects.toMatchObject({ code: 'SERVER' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy error</html>', { status: 200 })));
    await expect(api('/jobs', z.unknown())).rejects.toMatchObject({ code: 'SERVER' });
  });

  it('live mode without VITE_API_BASE_URL fails loudly', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/jobs', z.unknown())).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiAll() and apiUpload()', () => {
  it('reads every page of a paginated list', async () => {
    const page = (n: number) => ok({ items: [{ id: 'p' + n }], pagination: { page: n, totalPages: 3 } });
    const fetchMock = vi.fn().mockResolvedValueOnce(page(1)).mockResolvedValueOnce(page(2)).mockResolvedValueOnce(page(3));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiAll('/orders/mine', z.object({ id: z.string() }))).toEqual([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]![0])).toContain('page=3');
  });

  it('uploads the raw file with its type and encoded name; 413 is a validation error', async () => {
    session.start('tok-1', user);
    const file = new File(['%PDF-1.4'], 'drawing v2.pdf', { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue(ok({ document: { id: 'd1' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiUpload('/jobs/j1/documents', file, z.object({ document: z.object({ id: z.string() }) }))).toEqual({ document: { id: 'd1' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/jobs/j1/documents');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/pdf', 'X-File-Name': 'drawing%20v2.pdf', Authorization: 'Bearer tok-1' });
    expect(init.body).toBe(file);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(413, { success: false, message: 'Request body is too large' })));
    await expect(apiUpload('/jobs/j1/documents', file, z.unknown())).rejects.toMatchObject({ code: 'VALIDATION', status: 413 });
  });
});

describe('live service wiring', () => {
  it('live mode reads from the API and surfaces failures instead of returning mock data', async () => {
    session.start('tok-1', user);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(500, { success: false, message: 'boom' })));
    const live = createServices('live');
    expect(live.demo).toBeUndefined();
    await expect(live.buyer.listJobs('u1')).rejects.toBeInstanceOf(ServiceError);
  });
});
