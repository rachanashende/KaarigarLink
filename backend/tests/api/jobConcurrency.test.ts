import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { registerUser } from '../helpers/auth';

/**
 * Deterministic race test for PUT /api/jobs/:id: after the service reads the
 * job, a concurrent write (e.g. the matching engine marking it MATCHED) lands
 * before the service writes. The stale write must be rejected with 409.
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let buyer: { token: string };

beforeAll(async () => {
  await resetDatabase();
  buyer = { token: (await registerUser('BUYER')).token };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newJob() {
  const res = await request(app)
    .post('/api/jobs')
    .set(auth(buyer.token))
    .send({
      title: 'Race job',
      material: 'aluminium',
      manufacturingProcess: 'CNC_MACHINING',
      quantity: 100,
      deadline: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      requirements: [{ requirementType: 'MACHINE_TYPE', requirementValue: 'CNC_MILL' }],
    });
  return res.body.data.job as { id: string };
}

// One spy for the whole file (Vitest isolates modules per test file). With no
// injected write it simply delegates to the real findUnique. It is never
// restored: restoring a Prisma delegate method leaves it undefined.
const realFindUnique = prisma.job.findUnique.bind(prisma.job);
const findUniqueSpy = vi
  .spyOn(prisma.job, 'findUnique')
  .mockImplementation(realFindUnique as unknown as typeof prisma.job.findUnique);

/** Runs `concurrentWrite` right after the next prisma.job.findUnique resolves. */
function injectAfterNextJobRead(concurrentWrite: () => Promise<unknown>) {
  findUniqueSpy.mockImplementationOnce((async (args: Parameters<typeof realFindUnique>[0]) => {
    const snapshot = await realFindUnique(args);
    await concurrentWrite();
    return snapshot;
  }) as unknown as typeof prisma.job.findUnique);
}

describe('Optimistic concurrency on job updates', () => {
  it('rejects a stale update with 409 and leaves the concurrent change and requirements intact', async () => {
    const job = await newJob();
    injectAfterNextJobRead(() =>
      prisma.job.update({ where: { id: job.id }, data: { status: 'MATCHED', matchedAt: new Date() } }),
    );

    const res = await request(app)
      .put(`/api/jobs/${job.id}`)
      .set(auth(buyer.token))
      .send({ quantity: 5, requirements: [] });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, message: 'Job was modified, please retry' });
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: { requirements: true } });
    expect(row).toMatchObject({ status: 'MATCHED', quantity: 100 });
    expect(row.requirements).toHaveLength(1);
  });

  it('after a 409, a retry re-reads and applies the current rules', async () => {
    const job = await newJob();
    injectAfterNextJobRead(() => prisma.job.update({ where: { id: job.id }, data: { title: 'Edited elsewhere' } }));

    const first = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyer.token)).send({ quantity: 7 });
    expect(first.status).toBe(409);

    const retry = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyer.token)).send({ quantity: 7 });
    expect(retry.status).toBe(200);
    expect(retry.body.data.job).toMatchObject({ title: 'Edited elsewhere', quantity: 7 });
  });
});
