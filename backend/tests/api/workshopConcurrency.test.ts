import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

/**
 * Deterministic race tests for PUT /api/workshops/:id.
 *
 * The real ownership check still runs unchanged; this wrapper only lets a test
 * inject a concurrent write AFTER the service has read the workshop and BEFORE
 * it writes - the exact window an owner edit and an admin verification can race in.
 */
const hooks = vi.hoisted(() => ({ afterRead: null as null | (() => Promise<void>) }));

vi.mock('../../src/services/workshopAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/workshopAccess')>();
  return {
    ...actual,
    assertCanManageWorkshop: async (...args: Parameters<typeof actual.assertCanManageWorkshop>) => {
      const snapshot = await actual.assertCanManageWorkshop(...args);
      const hook = hooks.afterRead;
      hooks.afterRead = null; // run once
      if (hook) await hook();
      return snapshot;
    },
  };
});

import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { createUserDirect, registerUser } from '../helpers/auth';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let adminToken: string;

beforeAll(async () => {
  await resetDatabase();
  adminToken = (await createUserDirect('ADMIN')).token;
});

afterEach(() => {
  hooks.afterRead = null;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newWorkshop(name = 'Race Works') {
  const ws = await registerUser('WORKSHOP', { workshop: { businessName: name, city: 'Pune', latitude: 18.5, longitude: 73.8 } });
  return { id: ws.user.workshop.id as string, token: ws.token };
}

describe('Optimistic concurrency on workshop updates', () => {
  it('returns 409 for a stale update and does not overwrite the concurrent change', async () => {
    const { id, token } = await newWorkshop();

    // Someone else changes the description after our read.
    hooks.afterRead = async () => {
      await prisma.workshop.update({ where: { id }, data: { description: 'Concurrent edit' } });
    };
    const res = await request(app).put(`/api/workshops/${id}`).set(auth(token)).send({ description: 'My edit' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, message: 'Workshop was modified, please retry' });
    const row = await prisma.workshop.findUniqueOrThrow({ where: { id } });
    expect(row.description).toBe('Concurrent edit');
  });

  it('owner edit racing an admin verification cannot leave unreviewed details VERIFIED', async () => {
    const { id, token } = await newWorkshop('Original Name Works');

    // Owner reads while PENDING; admin verifies the ORIGINAL details before the owner writes.
    hooks.afterRead = async () => {
      await prisma.workshop.update({ where: { id }, data: { verificationStatus: 'VERIFIED' } });
    };
    const res = await request(app).put(`/api/workshops/${id}`).set(auth(token)).send({ businessName: 'Unreviewed Name' });

    expect(res.status).toBe(409);
    const row = await prisma.workshop.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ businessName: 'Original Name Works', verificationStatus: 'VERIFIED' });

    // Retrying re-reads VERIFIED, so the name change now correctly resets to PENDING.
    const retry = await request(app).put(`/api/workshops/${id}`).set(auth(token)).send({ businessName: 'Unreviewed Name' });
    expect(retry.status).toBe(200);
    expect(retry.body.data.workshop).toMatchObject({ businessName: 'Unreviewed Name', verificationStatus: 'PENDING' });
  });

  it('admin verification racing an owner edit is rejected, so admins never approve unseen details', async () => {
    const { id } = await newWorkshop('Seen By Admin Works');

    // Admin reads; owner renames before the admin's verification is written.
    hooks.afterRead = async () => {
      await prisma.workshop.update({ where: { id }, data: { businessName: 'Changed Behind Admin' } });
    };
    const res = await request(app).put(`/api/workshops/${id}`).set(auth(adminToken)).send({ verificationStatus: 'VERIFIED' });

    expect(res.status).toBe(409);
    const row = await prisma.workshop.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ businessName: 'Changed Behind Admin', verificationStatus: 'PENDING' });
  });

  it('non-racing updates still succeed and advance updatedAt', async () => {
    const { id, token } = await newWorkshop();
    const before = await prisma.workshop.findUniqueOrThrow({ where: { id } });

    const res = await request(app).put(`/api/workshops/${id}`).set(auth(token)).send({ description: 'Calm edit' });
    expect(res.status).toBe(200);
    expect(res.body.data.workshop.description).toBe('Calm edit');
    expect(new Date(res.body.data.workshop.updatedAt).getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
});
