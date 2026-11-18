import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Role } from '@prisma/client';
import { authorize } from '../../src/middleware/authorize';
import { ApiError } from '../../src/utils/ApiError';

// Minimal app: a fake "authenticate" that sets req.user from a header,
// so the role guard can be tested without a database.
function buildApp(...allowed: Role[]) {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.header('x-test-role') as Role | undefined;
    if (role) req.user = { id: 'u1', email: 'u@test.com', role };
    next();
  });
  app.get('/protected', authorize(...allowed), (_req, res) => res.json({ ok: true }));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof ApiError ? err.statusCode : 500;
    res.status(status).json({ success: false, message: (err as Error).message });
  });
  return app;
}

describe('authorize middleware', () => {
  it('allows a permitted role', async () => {
    const res = await request(buildApp('BUYER')).get('/protected').set('x-test-role', 'BUYER');
    expect(res.status).toBe(200);
  });

  it('rejects a role that is not permitted with 403', async () => {
    const res = await request(buildApp('BUYER')).get('/protected').set('x-test-role', 'WORKSHOP');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/BUYER/);
  });

  it('accepts any of several allowed roles', async () => {
    const res = await request(buildApp('WORKSHOP', 'ADMIN')).get('/protected').set('x-test-role', 'ADMIN');
    expect(res.status).toBe(200);
  });

  it('returns 401 when no user is attached', async () => {
    const res = await request(buildApp('BUYER')).get('/protected');
    expect(res.status).toBe(401);
  });
});
