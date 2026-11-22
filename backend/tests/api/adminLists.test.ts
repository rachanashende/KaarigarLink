import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { ADMIN, api, startedOrder, type TokenFor } from '../helpers/orderFlow';

/** M13: admin directory lists (GET /api/admin/*): pagination, limits and no sensitive fields. */
let tokenFor: TokenFor;
beforeEach(async () => {
  tokenFor = await seededSession();
  await startedOrder(tokenFor); // one order, quote and invitation to list
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('admin lists', () => {
  it.each(['users', 'workshops', 'orders', 'quotes', 'invitations'])('/admin/%s returns items with pagination', async (list) => {
    const res = await api(tokenFor, ADMIN, 'get', `/admin/${list}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 50 });
  });

  it('pages through users without overlap; the total matches the database', async () => {
    const total = await prisma.user.count();
    const first = await api(tokenFor, ADMIN, 'get', '/admin/users?page=1&limit=5');
    const second = await api(tokenFor, ADMIN, 'get', '/admin/users?page=2&limit=5');
    expect(first.body.data.pagination).toMatchObject({ page: 1, limit: 5, total, totalPages: Math.ceil(total / 5) });
    const ids = (r: typeof first) => r.body.data.items.map((u: { id: string }) => u.id);
    expect(ids(first)).toHaveLength(5);
    expect(ids(second).filter((id: string) => ids(first).includes(id))).toEqual([]);
    const beyond = await api(tokenFor, ADMIN, 'get', `/admin/users?page=${Math.ceil(total / 5) + 1}&limit=5`);
    expect(beyond.status).toBe(200);
    expect(beyond.body.data.items).toEqual([]);
  });

  it('never exposes password hashes or token versions', async () => {
    const res = await api(tokenFor, ADMIN, 'get', '/admin/users?limit=100');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|\$2[aby]\$/);
  });

  it('rejects invalid paging and unknown query keys with 400', async () => {
    for (const query of ['limit=0', 'limit=101', 'page=0', 'page=abc', 'role=ADMIN']) {
      const res = await api(tokenFor, ADMIN, 'get', '/admin/users?' + query);
      expect(res.status, query).toBe(400);
    }
  });
});
