import bcrypt from 'bcryptjs';
import type { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env';
import { normalizeCertifications, normalizeMaterial, normalizeMaterials } from '../../src/utils/normalize';
import { ALL_USERS, JOBS, SEED_EMAIL_DOMAIN, SEED_ID_PREFIX, WORKSHOPS } from './data';

const DAY_MS = 24 * 60 * 60 * 1000;

export class SeedConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedConflictError';
  }
}

export interface SeedOptions {
  /** Password for every seed account. Never committed: comes from SEED_DEFAULT_PASSWORD. */
  password: string;
  /** Reference "today" for relative dates (defaults to now). */
  now?: Date;
  log?: (message: string) => void;
}

export interface SeedSummary {
  users: number;
  workshops: number;
  machines: number;
  capabilities: number;
  capacities: number;
  jobs: number;
  requirements: number;
  quotesCleared: number;
  invitationsCleared: number;
}

/** Refuses to seed production unless explicitly allowed (e.g. a demo deployment). */
export function assertSeedAllowed(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === 'production' && environment.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new SeedConflictError(
      'Refusing to seed a production database. Set SEED_ALLOW_PRODUCTION=true to seed a demo deployment.',
    );
  }
}

export function validateSeedPassword(password: string | undefined): string {
  if (!password || password.length < 8 || password.length > 72) {
    throw new SeedConflictError(
      'SEED_DEFAULT_PASSWORD must be set (8-72 characters). Add it to backend/.env - it is not committed.',
    );
  }
  return password;
}

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dayStart = (today: Date, offset: number) => new Date(today.getTime() + offset * DAY_MS);
const dayEnd = (today: Date, offset: number) => new Date(today.getTime() + (offset + 1) * DAY_MS - 1);

/**
 * Seeds the database. Idempotent: running it again resets every seed-owned
 * record to the dataset (same ids, no duplicates). It only touches records
 * whose id starts with "seed-"; real data is never modified.
 */
export async function runSeed(prisma: PrismaClient, options: SeedOptions): Promise<SeedSummary> {
  const password = validateSeedPassword(options.password);
  const log = options.log ?? (() => undefined);
  const today = startOfUtcDay(options.now ?? new Date());

  // Safety: a real (non-seed) account must never be taken over by the seed.
  const emailClashes = await prisma.user.findMany({
    where: { email: { in: ALL_USERS.map((u) => u.email) }, NOT: { id: { startsWith: SEED_ID_PREFIX } } },
    select: { email: true },
  });
  if (emailClashes.length > 0) {
    throw new SeedConflictError(
      `Seed emails already used by real accounts: ${emailClashes.map((c) => c.email).join(', ')}. Nothing was changed.`,
    );
  }

  // Same algorithm and cost as registration (auth.service), computed once outside the transaction.
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  const summary: SeedSummary = {
    users: 0,
    workshops: 0,
    machines: 0,
    capabilities: 0,
    capacities: 0,
    jobs: 0,
    requirements: 0,
    quotesCleared: 0,
    invitationsCleared: 0,
  };

  const seedJobIds = JOBS.map((j) => j.id);
  const seedWorkshopIds = WORKSHOPS.map((w) => w.id);

  await prisma.$transaction(
    async (tx) => {
      // ---- Safety: order history is never deleted or rewritten ----
      // Orders (and their milestones, inspections, payments, ratings) are real
      // history. Resetting a seed job would rewrite an awarded job, and resetting
      // a seed workshop would overwrite ratings earned through real orders, so
      // refuse instead. Checked inside the transaction, before any write.
      const blockingOrders = await tx.order.findMany({
        where: { OR: [{ jobId: { in: seedJobIds } }, { workshopId: { in: seedWorkshopIds } }] },
        select: { id: true, jobId: true, workshopId: true },
        orderBy: { id: 'asc' },
        take: 5,
      });
      if (blockingOrders.length > 0) {
        const list = blockingOrders.map((o) => `${o.id} (job ${o.jobId}, workshop ${o.workshopId})`).join(', ');
        throw new SeedConflictError(
          `Orders exist on seed jobs or seed workshops: ${list}. Seeding would rewrite order history, so nothing was changed.`,
        );
      }

      // ---- Users ----
      for (const u of ALL_USERS) {
        const existing = await tx.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
        // Keep the current hash if it already matches, so reseeding is stable.
        const keepHash = existing ? await bcrypt.compare(password, existing.passwordHash) : false;
        await tx.user.upsert({
          where: { id: u.id },
          create: { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, passwordHash },
          update: {
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone ?? null,
            ...(!keepHash && { passwordHash }),
          },
        });
        summary.users += 1;
      }

      // ---- Workshops and their machines, capabilities, capacity ----
      for (const w of WORKSHOPS) {
        const profile = {
          businessName: w.businessName,
          description: w.description,
          address: w.address,
          city: w.city,
          latitude: w.latitude,
          longitude: w.longitude,
          certifications: normalizeCertifications(w.certifications),
          verificationStatus: w.verificationStatus,
          rating: w.rating,
          ratingCount: w.ratingCount,
          totalCompletedJobs: w.totalCompletedJobs,
        };
        await tx.workshop.upsert({
          where: { id: w.id },
          create: { id: w.id, userId: w.owner.id, ...profile },
          update: { userId: w.owner.id, ...profile },
        });
        summary.workshops += 1;

        // Remove children of this seed workshop that are not in the dataset
        // (e.g. added through the API during a demo), then upsert the dataset.
        await tx.machine.deleteMany({ where: { workshopId: w.id, id: { notIn: w.machines.map((m) => m.id) } } });
        await tx.capability.deleteMany({ where: { workshopId: w.id, id: { notIn: w.capabilities.map((c) => c.id) } } });
        await tx.workshopCapacity.deleteMany({ where: { workshopId: w.id, id: { notIn: w.capacities.map((c) => c.id) } } });

        for (const m of w.machines) {
          const data = {
            workshopId: w.id,
            machineName: m.machineName,
            machineType: m.machineType,
            quantity: m.quantity,
            operationalStatus: m.operationalStatus,
            specifications: (m.specifications ?? undefined) as Prisma.InputJsonValue | undefined,
          };
          await tx.machine.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
          summary.machines += 1;
        }

        for (const c of w.capabilities) {
          const data = {
            workshopId: w.id,
            manufacturingProcess: c.manufacturingProcess,
            supportedMaterials: normalizeMaterials(c.supportedMaterials),
            leadTimeDays: c.leadTimeDays,
            specifications: (c.specifications ?? undefined) as Prisma.InputJsonValue | undefined,
          };
          await tx.capability.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
          summary.capabilities += 1;
        }

        for (const k of w.capacities) {
          const data = {
            workshopId: w.id,
            availableCapacity: k.availableCapacity,
            capacityUnit: k.capacityUnit,
            startDate: dayStart(today, k.startDay),
            endDate: dayEnd(today, k.endDay),
          };
          await tx.workshopCapacity.upsert({ where: { id: k.id }, create: { id: k.id, ...data }, update: data });
          summary.capacities += 1;
        }
      }

      // ---- Jobs and requirements ----
      // Reset matching state of seed jobs so every run starts from the same point.
      // Quotes first: they reference the invitations (onDelete: Restrict). No order
      // can reference them here - the guard above refused any order on a seed job.
      const clearedQuotes = await tx.quote.deleteMany({
        where: { OR: [{ jobId: { in: seedJobIds } }, { invitation: { is: { jobId: { in: seedJobIds } } } }] },
      });
      summary.quotesCleared = clearedQuotes.count;
      const cleared = await tx.jobInvitation.deleteMany({ where: { jobId: { in: seedJobIds } } });
      summary.invitationsCleared = cleared.count;

      for (const j of JOBS) {
        const data = {
          buyerId: j.buyerId,
          title: j.title,
          description: j.description,
          material: normalizeMaterial(j.material),
          manufacturingProcess: j.manufacturingProcess,
          quantity: j.quantity,
          quantityUnit: j.quantityUnit,
          deadline: dayEnd(today, j.deadlineDay),
          address: j.address,
          latitude: j.latitude,
          longitude: j.longitude,
          technicalSpecifications: j.technicalSpecifications as Prisma.InputJsonValue,
          status: j.status,
          matchedAt: null,
        };
        await tx.job.upsert({ where: { id: j.id }, create: { id: j.id, ...data }, update: data });
        summary.jobs += 1;

        await tx.jobRequirement.deleteMany({ where: { jobId: j.id } });
        if (j.requirements.length > 0) {
          await tx.jobRequirement.createMany({ data: j.requirements.map((r) => ({ ...r, jobId: j.id })) });
        }
        summary.requirements += j.requirements.length;
      }
    },
    // Many small writes; generous limits for slower hosted databases.
    { timeout: 120_000, maxWait: 20_000 },
  );

  log(
    `Seeded ${summary.users} users, ${summary.workshops} workshops (${summary.machines} machines, ` +
      `${summary.capabilities} capabilities, ${summary.capacities} capacity windows), ` +
      `${summary.jobs} jobs (${summary.requirements} requirements). ` +
      `Cleared ${summary.quotesCleared} seed-job quotes and ${summary.invitationsCleared} seed-job invitations. ` +
      `Accounts use @${SEED_EMAIL_DOMAIN}.`,
  );
  return summary;
}
