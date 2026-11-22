import { z } from 'zod';
import { JobStatus, MachineType, ManufacturingProcess, QuantityUnit, RequirementType } from '@prisma/client';
import { coordinatesPairCheck, dateInput, jsonObjectSchema, latitudeSchema, longitudeSchema } from './common';
import { normalizeCertification, normalizeMaterial } from '../utils/normalize';

/** Deadline rules: far enough ahead to produce anything, not absurdly far. */
export const JOB_DEADLINE_RULES = {
  minHoursAhead: 24,
  maxDaysAhead: 730,
} as const;

export const MAX_REQUIREMENTS = 20;
export const MAX_QUANTITY = 10_000_000;

const HOUR_MS = 60 * 60 * 1000;

const deadlineSchema = dateInput({ endOfDay: true }).superRefine((date, ctx) => {
  const now = Date.now();
  if (date.getTime() < now + JOB_DEADLINE_RULES.minHoursAhead * HOUR_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `deadline must be at least ${JOB_DEADLINE_RULES.minHoursAhead} hours in the future`,
    });
  }
  if (date.getTime() > now + JOB_DEADLINE_RULES.maxDaysAhead * 24 * HOUR_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `deadline must be within ${JOB_DEADLINE_RULES.maxDaysAhead} days`,
    });
  }
});

const positiveNumberString = (label: string) =>
  z
    .union([z.number(), z.string().trim()])
    .transform((v, ctx) => {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0 || (typeof v === 'string' && v === '')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a positive number (mm)` });
        return z.NEVER;
      }
      return String(n);
    });

/**
 * One requirement. The value is validated and normalised according to its type,
 * because the matching engine reads these values:
 *   MACHINE_TYPE   -> a MachineType enum value
 *   TOLERANCE_MM   -> positive number, stored as a string
 *   PART_SIZE_MM   -> positive number, stored as a string
 *   CERTIFICATION  -> normalised like workshop certifications ("iso 9001" -> "ISO_9001")
 *   OTHER          -> free text (informational, never filters)
 */
export const jobRequirementSchema = z
  .object({
    requirementType: z.nativeEnum(RequirementType),
    requirementValue: z.union([z.string(), z.number()]),
    isMandatory: z.boolean().default(true),
  })
  .strict()
  .transform((req, ctx) => {
    const raw = req.requirementValue;
    const fail = (message: string) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requirementValue'], message });
      return z.NEVER;
    };

    switch (req.requirementType) {
      case 'MACHINE_TYPE': {
        const value = String(raw).trim().toUpperCase();
        if (!(value in MachineType)) {
          return fail(`requirementValue must be one of: ${Object.keys(MachineType).join(', ')}`);
        }
        return { ...req, requirementValue: value };
      }
      case 'TOLERANCE_MM':
      case 'PART_SIZE_MM': {
        const parsed = positiveNumberString(req.requirementType).safeParse(raw);
        if (!parsed.success) return fail(parsed.error.issues[0].message);
        return { ...req, requirementValue: parsed.data };
      }
      case 'CERTIFICATION': {
        const value = typeof raw === 'string' ? normalizeCertification(raw) : '';
        if (!value || value.length > 50) return fail('requirementValue must be a certification code (max 50 chars)');
        return { ...req, requirementValue: value };
      }
      case 'OTHER': {
        const value = String(raw).trim();
        if (!value || value.length > 500) return fail('requirementValue must be 1-500 characters');
        return { ...req, requirementValue: value };
      }
    }
  });

/** Single-value types may appear once; others may not repeat the same value. */
const SINGLE_VALUE_TYPES: RequirementType[] = ['TOLERANCE_MM', 'PART_SIZE_MM'];

const requirementsSchema = z
  .array(jobRequirementSchema)
  .max(MAX_REQUIREMENTS, `At most ${MAX_REQUIREMENTS} requirements`)
  .superRefine((reqs, ctx) => {
    const seen = new Set<string>();
    reqs.forEach((r, i) => {
      const key = SINGLE_VALUE_TYPES.includes(r.requirementType)
        ? r.requirementType
        : `${r.requirementType}:${r.requirementValue}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i],
          message: SINGLE_VALUE_TYPES.includes(r.requirementType)
            ? `Only one ${r.requirementType} requirement is allowed`
            : `Duplicate requirement ${r.requirementType}=${r.requirementValue}`,
        });
      }
      seen.add(key);
    });
  });

const jobFields = {
  title: z.string().trim().min(3, 'title must be at least 3 characters').max(150),
  description: z.string().trim().max(5000),
  material: z
    .string()
    .trim()
    .min(1, 'material is required')
    .max(60)
    .transform(normalizeMaterial),
  manufacturingProcess: z.nativeEnum(ManufacturingProcess),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .int('quantity must be a whole number')
    .positive('quantity must be greater than 0')
    .max(MAX_QUANTITY),
  quantityUnit: z.nativeEnum(QuantityUnit),
  deadline: deadlineSchema,
  address: z.string().trim().max(300),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  technicalSpecifications: jsonObjectSchema,
};

/** Statuses a buyer may choose at creation. MATCHED and later are system-managed. */
const CREATE_STATUSES = ['DRAFT', 'OPEN'] as const;
/** Statuses a buyer may set on update (transitions are checked in the service). */
export const BUYER_SETTABLE_STATUSES = ['DRAFT', 'OPEN', 'CANCELLED'] as const;

export const createJobSchema = z
  .object({
    title: jobFields.title,
    description: jobFields.description.optional(),
    material: jobFields.material,
    manufacturingProcess: jobFields.manufacturingProcess,
    quantity: jobFields.quantity,
    quantityUnit: jobFields.quantityUnit.default('UNITS'),
    deadline: jobFields.deadline,
    address: jobFields.address.optional(),
    latitude: jobFields.latitude.optional(),
    longitude: jobFields.longitude.optional(),
    technicalSpecifications: jobFields.technicalSpecifications.optional(),
    status: z.enum(CREATE_STATUSES).default('OPEN'),
    requirements: requirementsSchema.default([]),
  })
  // strict: rejects buyerId, matchedAt, budget and any other unsupported field.
  .strict()
  .superRefine(coordinatesPairCheck);

export const updateJobSchema = z
  .object({
    title: jobFields.title.optional(),
    description: jobFields.description.nullable().optional(),
    material: jobFields.material.optional(),
    manufacturingProcess: jobFields.manufacturingProcess.optional(),
    quantity: jobFields.quantity.optional(),
    quantityUnit: jobFields.quantityUnit.optional(),
    deadline: jobFields.deadline.optional(),
    address: jobFields.address.nullable().optional(),
    latitude: jobFields.latitude.nullable().optional(),
    longitude: jobFields.longitude.nullable().optional(),
    technicalSpecifications: jobFields.technicalSpecifications.nullable().optional(),
    status: z.enum(BUYER_SETTABLE_STATUSES).optional(),
    /** When present, REPLACES all existing requirements ([] clears them). */
    requirements: requirementsSchema.optional(),
  })
  .strict()
  .superRefine(coordinatesPairCheck)
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const jobIdParams = z.object({ id: z.string().min(1) });

export const listJobsQuery = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuery>;
export type JobRequirementInput = z.infer<typeof jobRequirementSchema>;
