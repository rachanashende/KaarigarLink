import { fixtures } from './mock/fixtures';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest } from './apiClient';
import { createServices, serviceMode } from './index';
import { createMockService } from './adapters/mock';
import { createMockStore } from './mock/store';

describe('mock foundation', () => {
  it('shares coherent state between service consumers without exposing references', async () => {
    const store = createMockStore();
    const buyer = createMockService(store);
    const inspector = createMockService(store);
    store.commit(draft => { draft.jobs[0]!.title = 'Updated fixture'; });
    expect((await buyer.list('jobs'))[0]?.title).toBe('Updated fixture');
    const jobs = await inspector.list('jobs');
    jobs[0]!.title = 'Leaked mutation';
    expect((await buyer.list('jobs'))[0]?.title).toBe('Updated fixture');
    expect((await buyer.list('users')).some(user => user.id === jobs[0]?.buyerId)).toBe(true);
    store.reset();
    expect((await buyer.list('jobs'))[0]?.title).toBe('Machine aluminium mounting brackets');
  });
  it('isolates instances and rolls back failed updates', async () => {
    const store = createMockStore();
    expect(() => store.commit(draft => { draft.jobs.length = 0; throw new Error('failed'); })).toThrow('failed');
    expect(store.snapshot().jobs).toHaveLength(fixtures.jobs.length);
    store.commit(draft => { draft.jobs.length = 0; });
    expect(await createMockService(store).list('jobs')).toEqual([]);
    expect(await createServices().list('jobs')).toHaveLength(fixtures.jobs.length);
  });
  it('fails explicitly for invalid modes instead of falling back to mock data', () => {
    // M10: 'live' is now a supported mode; anything other than mock/live still fails loudly.
    expect(() => createServices('real')).toThrow('VITE_SERVICE_MODE must be "mock" or "live"');
    expect(() => createServices('typo')).toThrow('VITE_SERVICE_MODE must be "mock" or "live"');
    expect(() => createServices('')).toThrow('VITE_SERVICE_MODE');
    expect(serviceMode()).toBe('mock'); // mock remains the default
  });
});

describe('API boundary', () => {
  const schema = z.object({ id: z.string() });
  it('validates a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'job-1' })));
    expect(await apiRequest('/api/jobs/job-1', schema)).toEqual({ id: 'job-1' });
  });
  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'CONFLICT'], [422, 'VALIDATION'], [500, 'SERVER']])('surfaces HTTP %s without mock fallback', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: Number(status) })));
    await expect(apiRequest('/api/jobs', schema)).rejects.toMatchObject({ code });
  });
  it('rejects malformed response shapes and JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 1 })));
    await expect(apiRequest('/api/jobs', schema)).rejects.toMatchObject({ code: 'VALIDATION' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid')));
    await expect(apiRequest('/api/jobs', schema)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('surfaces network failure and preserves cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiRequest('/api/jobs', schema)).rejects.toMatchObject({ code: 'NETWORK' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));
    await expect(apiRequest('/api/jobs', schema)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
