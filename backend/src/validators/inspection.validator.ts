import { InspectionStatus } from '@prisma/client';
import { z } from 'zod';

// ---------- M11: structured checklist ----------

const evidenceSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    mediaType: z.string().trim().max(255),
    sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024),
    /** M12: the uploaded Document (POST /orders/:orderId/documents) this entry refers to. */
    documentId: z.string().trim().min(1).optional(),
  })
  .strict();

/** One checklist line. `result` uses the inspector UI's values; evidence is metadata only (no file storage). */
export const checklistItemSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(200),
    result: z.enum(['UNRECORDED', 'PASS', 'FAIL', 'NOT_APPLICABLE']),
    notes: z.string().trim().max(4000).default(''),
    evidence: z.array(evidenceSchema).max(3).default([]),
  })
  .strict();

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** Structured rework details (REWORK_REQUIRED only). */
export const reworkDetailsSchema = z
  .object({
    reason: z.string().trim().min(1, 'rework reason is required').max(4000),
    correctiveAction: z.string().trim().max(4000).default(''),
    deadline: z.string().regex(DATE_ONLY, 'deadline must be YYYY-MM-DD').optional(),
  })
  .strict();

/** Stored as Inspection.checklist / InspectionDraft.checklist: { version: 1, items, rework? }. */
export const checklistSchema = z
  .object({
    items: z.array(checklistItemSchema).max(20),
    rework: reworkDetailsSchema.optional(),
  })
  .strict()
  .refine((c) => new Set(c.items.map((item) => item.id)).size === c.items.length, {
    message: 'checklist item ids must be unique',
    path: ['items'],
  });

export const createInspectionBodySchema = z
  .object({
    status: z.enum(['PASSED', 'FAILED', 'REWORK_REQUIRED'], {
      errorMap: () => ({ message: 'status must be PASSED, FAILED or REWORK_REQUIRED' }),
    }),
    findings: z.string().trim().min(1, 'findings cannot be empty').max(2000, 'findings must be at most 2000 characters').optional(),
    /** B2: which milestone to send back (REWORK_REQUIRED only). */
    milestoneId: z.string().trim().min(1, 'milestoneId cannot be empty').optional(),
    /** M11: structured checklist results, stored separately from the free-text findings. */
    checklist: checklistSchema.optional(),
  })
  .strict()
  .refine((d) => d.milestoneId === undefined || d.status === 'REWORK_REQUIRED', {
    message: 'milestoneId is only allowed with status REWORK_REQUIRED',
    path: ['milestoneId'],
  })
  .refine((d) => d.checklist?.rework === undefined || d.status === 'REWORK_REQUIRED', {
    message: 'rework details are only allowed with status REWORK_REQUIRED',
    path: ['checklist', 'rework'],
  });

/** M11: PUT /api/orders/:orderId/inspection-draft (the whole draft is replaced). */
export const saveDraftBodySchema = z
  .object({
    checklist: checklistSchema,
    findings: z.string().trim().max(4000).optional(),
  })
  .strict();
export type SaveDraftInput = z.infer<typeof saveDraftBodySchema>;

// ---------- B1: inspector assignment ----------

export const assignInspectorBodySchema = z
  .object({
    inspectorId: z
      .string({ required_error: 'inspectorId is required', invalid_type_error: 'inspectorId must be a string' })
      .trim()
      .min(1, 'inspectorId is required'),
  })
  .strict();

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

/** ADMIN platform-wide inspection list. */
export const listInspectionsQuery = z
  .object({
    status: z.nativeEnum(InspectionStatus).optional(),
    inspectorId: z.string().min(1).optional(),
    orderId: z.string().min(1).optional(),
    page,
    limit,
  })
  .strict();

/** INSPECTOR: the orders currently assigned to me. */
export const assignedOrdersQuery = z.object({ page, limit }).strict();

export type CreateInspectionInput = z.infer<typeof createInspectionBodySchema>;
export type AssignInspectorInput = z.infer<typeof assignInspectorBodySchema>;
export type ListInspectionsQuery = z.infer<typeof listInspectionsQuery>;
export type AssignedOrdersQuery = z.infer<typeof assignedOrdersQuery>;
