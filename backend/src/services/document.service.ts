/**
 * M12 documents: buyer design files on jobs, inspector evidence on orders.
 *
 * Access (everyone else gets 404, never a hint that the record exists):
 *   Job design files     read: ADMIN, the job's buyer, workshops invited to or awarded
 *                        the job, the inspector currently assigned to its order.
 *                        upload/delete: the job's buyer while the job is DRAFT/OPEN/MATCHED.
 *   Order evidence       read: ADMIN, the order's buyer and awarded workshop, the current inspector.
 *                        upload: the current inspector while the order is IN_PROGRESS.
 *                        delete: its uploader while still assigned and not yet part of a
 *                        submitted inspection.
 *
 * Contents go to the storage backend under a server-generated key; PostgreSQL keeps
 * metadata only. Size, extension and MIME type are validated, and common formats are
 * checked against their magic bytes.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { DocumentKind, Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { getMyWorkshopId } from './workshop.service';
import { newStorageKey, storage } from './storage';
import { currentInspectorId } from './inspectorAssignment.service';
import { recordEvent } from './events';

const MAX_FILES_PER_RECORD = 20;
const EDITABLE_JOB = ['DRAFT', 'OPEN', 'MATCHED'];

/** Allowed extensions and the MIME types accepted for each. */
const ALLOWED: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  txt: ['text/plain'], csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  // CAD formats have no reliable browser MIME type.
  dxf: ['application/dxf', 'image/vnd.dxf', 'application/octet-stream'],
  dwg: ['application/acad', 'image/vnd.dwg', 'application/octet-stream'],
  step: ['application/step', 'model/step', 'application/octet-stream'], stp: ['application/step', 'model/step', 'application/octet-stream'],
  stl: ['model/stl', 'application/sla', 'application/vnd.ms-pki.stl', 'application/octet-stream'],
  iges: ['model/iges', 'application/iges', 'application/octet-stream'], igs: ['model/iges', 'application/iges', 'application/octet-stream'],
};
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  docx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  xlsx: (b) => b[0] === 0x50 && b[1] === 0x4b,
};

/** Display name only: no directories, control characters or path separators; ≤ 200 chars. */
export function sanitizeFileName(raw: string): string {
  let name = raw;
  try { name = decodeURIComponent(raw); } catch { /* keep the raw value */ }
  name = path.basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').trim();
  if (!name || name === '.' || name === '..') throw ApiError.badRequest('A file name is required (X-File-Name header)');
  return name.length > 200 ? name.slice(0, 200) : name;
}

function validate(name: string, mimeType: string, contents: Buffer) {
  if (!contents.length) throw ApiError.badRequest('The file is empty');
  if (contents.length > env.MAX_UPLOAD_BYTES) throw ApiError.badRequest(`The file exceeds the ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`);
  const extension = path.extname(name).slice(1).toLowerCase();
  const allowed = ALLOWED[extension];
  if (!allowed) throw ApiError.badRequest(`.${extension || '?'} files are not accepted. Allowed: ${Object.keys(ALLOWED).join(', ')}`);
  const mime = mimeType.split(';')[0]!.trim().toLowerCase();
  if (!allowed.includes(mime)) throw ApiError.badRequest(`The file type ${mime || 'unknown'} does not match a .${extension} file`);
  const magic = MAGIC[extension];
  if (magic && !magic(contents)) throw ApiError.badRequest(`The file contents are not a valid .${extension} file`);
  return mime;
}

const docSelect = {
  id: true, kind: true, uploaderId: true, jobId: true, orderId: true, inspectionId: true,
  originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true,
  uploader: { select: { id: true, name: true } },
} satisfies Prisma.DocumentSelect;
const notFound = () => ApiError.notFound('Document not found');

// ---------- Access rules ----------

async function canReadJob(user: AuthUser, jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { buyerId: true, order: { select: { id: true, workshopId: true } } } });
  if (!job) return false;
  if (user.role === 'ADMIN' || job.buyerId === user.id) return true;
  if (user.role === 'WORKSHOP') {
    const workshopId = await getMyWorkshopId(user).catch(() => null);
    if (!workshopId) return false;
    if (job.order?.workshopId === workshopId) return true;
    return (await prisma.jobInvitation.count({ where: { jobId, workshopId } })) > 0;
  }
  if (user.role === 'INSPECTOR' && job.order) return (await currentInspectorId(job.order.id)) === user.id;
  return false;
}
async function canReadOrder(user: AuthUser, orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true, workshopId: true } });
  if (!order) return false;
  if (user.role === 'ADMIN' || order.buyerId === user.id) return true;
  if (user.role === 'WORKSHOP') return order.workshopId === (await getMyWorkshopId(user).catch(() => null));
  if (user.role === 'INSPECTOR') return (await currentInspectorId(orderId)) === user.id;
  return false;
}

// ---------- Upload ----------

export interface UploadInput { fileName: string; mimeType: string; contents: Buffer }

async function store(user: AuthUser, kind: DocumentKind, scope: { jobId?: string; orderId?: string }, input: UploadInput, audit: { jobId: string | null; orderId: string | null }) {
  const name = sanitizeFileName(input.fileName);
  const mimeType = validate(name, input.mimeType, input.contents);
  const count = await prisma.document.count({ where: scope });
  if (count >= MAX_FILES_PER_RECORD) throw ApiError.conflict(`At most ${MAX_FILES_PER_RECORD} files can be attached here`);
  const storageKey = newStorageKey();
  await storage.put(storageKey, input.contents);
  try {
    return await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          kind, uploaderId: user.id, ...scope, originalName: name, mimeType, sizeBytes: input.contents.length, storageKey,
          sha256: createHash('sha256').update(input.contents).digest('hex'),
        },
        select: docSelect,
      });
      await recordEvent(tx, {
        actor: user, action: 'DOCUMENT_UPLOADED', entityType: 'Document', entityId: doc.id, orderId: audit.orderId, jobId: audit.jobId,
        metadata: { kind, sizeBytes: doc.sizeBytes, mimeType },
      });
      return doc;
    });
  } catch (err) {
    await storage.remove(storageKey); // no orphaned file when the metadata write fails
    throw err;
  }
}

export async function uploadJobDocument(user: AuthUser, jobId: string, input: UploadInput) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { buyerId: true, status: true } });
  if (!job || job.buyerId !== user.id) throw ApiError.notFound('Job not found');
  if (!EDITABLE_JOB.includes(job.status)) throw ApiError.conflict(`Design files can only be changed while the job is DRAFT, OPEN or MATCHED (this job is ${job.status})`);
  return store(user, 'DESIGN_FILE', { jobId }, input, { jobId, orderId: null });
}

export async function uploadOrderEvidence(user: AuthUser, orderId: string, input: UploadInput) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, jobId: true } });
  if (!order || user.role !== 'INSPECTOR' || (await currentInspectorId(orderId)) !== user.id) throw ApiError.notFound('Order not found');
  if (order.status !== 'IN_PROGRESS') throw ApiError.conflict(`Evidence can only be added while the order is IN_PROGRESS (this order is ${order.status})`);
  return store(user, 'INSPECTION_EVIDENCE', { orderId }, input, { jobId: order.jobId, orderId });
}

// ---------- List / download / delete ----------

export async function listJobDocuments(user: AuthUser, jobId: string) {
  if (!(await canReadJob(user, jobId))) throw ApiError.notFound('Job not found');
  return prisma.document.findMany({ where: { jobId }, select: docSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
}
export async function listOrderDocuments(user: AuthUser, orderId: string) {
  if (!(await canReadOrder(user, orderId))) throw ApiError.notFound('Order not found');
  return prisma.document.findMany({ where: { orderId }, select: docSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
}

async function readable(user: AuthUser, id: string) {
  const doc = await prisma.document.findUnique({ where: { id }, select: { ...docSelect, storageKey: true } });
  if (!doc) throw notFound();
  const allowed = doc.jobId ? await canReadJob(user, doc.jobId) : doc.orderId ? await canReadOrder(user, doc.orderId) : false;
  if (!allowed) throw notFound();
  return doc;
}

export async function openDocument(user: AuthUser, id: string) {
  const doc = await readable(user, id);
  const stream = await storage.open(doc.storageKey);
  if (!stream) throw new ApiError(410, 'The file content is no longer available');
  return { doc, stream };
}

export async function deleteDocument(user: AuthUser, id: string) {
  const doc = await readable(user, id);
  if (doc.uploaderId !== user.id) throw ApiError.forbidden('Only the uploader can delete this file');
  if (doc.jobId) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: doc.jobId }, select: { status: true } });
    if (!EDITABLE_JOB.includes(job.status)) throw ApiError.conflict(`Design files can only be changed while the job is DRAFT, OPEN or MATCHED (this job is ${job.status})`);
  }
  if (doc.orderId && doc.inspectionId) throw ApiError.conflict('This evidence is part of a submitted inspection and cannot be deleted');
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.document.deleteMany({ where: { id, inspectionId: null } });
    if (count !== 1) throw ApiError.conflict('This file changed, please retry');
    await recordEvent(tx, { actor: user, action: 'DOCUMENT_DELETED', entityType: 'Document', entityId: id, orderId: doc.orderId, jobId: doc.jobId, metadata: { kind: doc.kind } });
  });
  await storage.remove(doc.storageKey);
  return { deleted: true };
}

/** Called inside inspection submission: evidence the inspector uploaded becomes part of it. */
export async function linkEvidence(tx: Prisma.TransactionClient, orderId: string, inspectorId: string, inspectionId: string, documentIds: string[]) {
  if (!documentIds.length) return;
  await tx.document.updateMany({
    where: { id: { in: documentIds }, orderId, uploaderId: inspectorId, kind: 'INSPECTION_EVIDENCE', inspectionId: null },
    data: { inspectionId },
  });
}
