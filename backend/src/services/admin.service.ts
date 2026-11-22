/**
 * M10: read-only ADMIN directory endpoints used by the admin workspace.
 * Every list is paginated (limit 1-100) and newest first. No writes here:
 * verification stays on PUT /api/workshops/:id and assignments on
 * /api/orders/:orderId/inspector. Users never expose passwordHash.
 */
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { publicUserSelect } from '../utils/selects';
import type { AdminListQuery } from '../validators/admin.validator';
import { workshopDetailInclude } from './workshop.service';

function assertAdmin(user: AuthUser) {
  if (user.role !== 'ADMIN') throw ApiError.forbidden();
}

const page = (query: AdminListQuery, total: number) => ({
  page: query.page,
  limit: query.limit,
  total,
  totalPages: Math.ceil(total / query.limit),
});
const slice = (query: AdminListQuery) => ({ skip: (query.page - 1) * query.limit, take: query.limit });
const money = (d: Prisma.Decimal) => d.toFixed(2);

export async function listUsers(user: AuthUser, query: AdminListQuery) {
  assertAdmin(user);
  const [total, items] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.findMany({ select: publicUserSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...slice(query) }),
  ]);
  return { items, pagination: page(query, total) };
}

export async function listOrders(user: AuthUser, query: AdminListQuery) {
  assertAdmin(user);
  const [total, rows] = await prisma.$transaction([
    prisma.order.count(),
    prisma.order.findMany({
      include: {
        milestones: { orderBy: { sequence: 'asc' } },
        quote: { select: { id: true, totalPrice: true, estimatedDays: true, createdAt: true, status: true, notes: true } },
        inspections: { orderBy: [{ inspectedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { status: true } },
        inspectorAssignments: { where: { active: true }, select: { inspectorId: true, assignedAt: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...slice(query),
    }),
  ]);
  const items = rows.map(({ agreedPrice, quote, inspections, inspectorAssignments, ...order }) => ({
    ...order,
    agreedPrice: money(agreedPrice),
    quote: { ...quote, totalPrice: money(quote.totalPrice) },
    latestInspectionStatus: inspections[0]?.status ?? null,
    activeAssignment: inspectorAssignments[0] ?? null,
  }));
  return { items, pagination: page(query, total) };
}

export async function listQuotes(user: AuthUser, query: AdminListQuery) {
  assertAdmin(user);
  const [total, rows] = await prisma.$transaction([
    prisma.quote.count(),
    prisma.quote.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...slice(query) }),
  ]);
  return { items: rows.map((q) => ({ ...q, totalPrice: money(q.totalPrice) })), pagination: page(query, total) };
}

/** Includes the matching snapshot stored with each invitation (score, reasons). */
export async function listInvitations(user: AuthUser, query: AdminListQuery) {
  assertAdmin(user);
  const [total, items] = await prisma.$transaction([
    prisma.jobInvitation.count(),
    prisma.jobInvitation.findMany({
      select: {
        id: true, jobId: true, workshopId: true, status: true, matchScore: true, rank: true,
        matchReasons: true, createdAt: true, respondedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...slice(query),
    }),
  ]);
  return { items, pagination: page(query, total) };
}

/** M11: full workshop profiles (machines, capabilities, capacity) in one paginated list, replacing per-workshop reads. */
export async function listWorkshops(user: AuthUser, query: AdminListQuery) {
  assertAdmin(user);
  const [total, items] = await prisma.$transaction([
    prisma.workshop.count(),
    prisma.workshop.findMany({ include: workshopDetailInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...slice(query) }),
  ]);
  return { items, pagination: page(query, total) };
}
