import { z } from 'zod';
import { MachineStatus, MachineType, ManufacturingProcess, QuantityUnit, VerificationStatus } from '@prisma/client';
import { coordinatesPairCheck, dateInput, jsonObjectSchema, latitudeSchema, longitudeSchema } from './common';

// ---------- Params ----------
export const workshopIdParams = z.object({ id: z.string().min(1) });
export const machineParams = workshopIdParams.extend({ machineId: z.string().min(1) });
export const capabilityParams = workshopIdParams.extend({ capabilityId: z.string().min(1) });
export const capacityParams = workshopIdParams.extend({ capacityId: z.string().min(1) });

// ---------- Workshop profile ----------
const profileFields = {
  businessName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable(),
  address: z.string().trim().max(300).nullable(),
  city: z.string().trim().max(100).nullable(),
  latitude: latitudeSchema.nullable(),
  longitude: longitudeSchema.nullable(),
  certifications: z.array(z.string().trim().min(1).max(50)).max(20),
};

export const createWorkshopSchema = z
  .object({
    businessName: profileFields.businessName,
    description: profileFields.description.optional(),
    address: profileFields.address.optional(),
    city: profileFields.city.optional(),
    latitude: profileFields.latitude.optional(),
    longitude: profileFields.longitude.optional(),
    certifications: profileFields.certifications.optional(),
  })
  .superRefine(coordinatesPairCheck);

export const updateWorkshopSchema = z
  .object({
    businessName: profileFields.businessName.optional(),
    description: profileFields.description.optional(),
    address: profileFields.address.optional(),
    city: profileFields.city.optional(),
    latitude: profileFields.latitude.optional(),
    longitude: profileFields.longitude.optional(),
    certifications: profileFields.certifications.optional(),
    /** ADMIN only - enforced in the service. */
    verificationStatus: z.nativeEnum(VerificationStatus).optional(),
  })
  .strict()
  .superRefine(coordinatesPairCheck)
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const listWorkshopsQuery = z.object({
  process: z.nativeEnum(ManufacturingProcess).optional(),
  city: z.string().trim().min(1).optional(),
  verificationStatus: z.nativeEnum(VerificationStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Machines ----------
export const createMachineSchema = z.object({
  machineName: z.string().trim().min(1).max(120),
  machineType: z.nativeEnum(MachineType),
  specifications: jsonObjectSchema.optional(),
  quantity: z.number().int().min(1).max(10000).default(1),
  operationalStatus: z.nativeEnum(MachineStatus).default('OPERATIONAL'),
});

export const updateMachineSchema = z
  .object({
    machineName: z.string().trim().min(1).max(120).optional(),
    machineType: z.nativeEnum(MachineType).optional(),
    specifications: jsonObjectSchema.nullable().optional(),
    quantity: z.number().int().min(1).max(10000).optional(),
    operationalStatus: z.nativeEnum(MachineStatus).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

// ---------- Capabilities ----------
/** Known keys are validated (the matching engine reads them); extra keys are kept. */
export const capabilitySpecsSchema = z
  .object({
    minToleranceMm: z.number().positive().optional(),
    maxPartSizeMm: z.number().positive().optional(),
  })
  .passthrough();

export const createCapabilitySchema = z.object({
  manufacturingProcess: z.nativeEnum(ManufacturingProcess),
  supportedMaterials: z.array(z.string().trim().min(1).max(60)).min(1, 'At least one material is required').max(50),
  specifications: capabilitySpecsSchema.optional(),
  leadTimeDays: z.number().int().min(0).max(365).default(0),
});

export const updateCapabilitySchema = z
  .object({
    supportedMaterials: z.array(z.string().trim().min(1).max(60)).min(1).max(50).optional(),
    specifications: capabilitySpecsSchema.nullable().optional(),
    leadTimeDays: z.number().int().min(0).max(365).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

// ---------- Capacity windows ----------
const endAfterStart = (d: { startDate?: Date; endDate?: Date }, ctx: z.RefinementCtx) => {
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'endDate must be on or after startDate' });
  }
};

export const createCapacitySchema = z
  .object({
    availableCapacity: z.number().int().min(1, 'availableCapacity must be a positive integer').max(10_000_000),
    capacityUnit: z.nativeEnum(QuantityUnit).default('UNITS'),
    startDate: dateInput(),
    endDate: dateInput({ endOfDay: true }),
  })
  .superRefine(endAfterStart)
  .refine((d) => d.endDate.getTime() >= Date.now(), {
    path: ['endDate'],
    message: 'endDate must not be in the past',
  });

export const updateCapacitySchema = z
  .object({
    // 0 is allowed on update: "fully booked for this window".
    availableCapacity: z.number().int().min(0).max(10_000_000).optional(),
    capacityUnit: z.nativeEnum(QuantityUnit).optional(),
    startDate: dateInput().optional(),
    endDate: dateInput({ endOfDay: true }).optional(),
  })
  .strict()
  .superRefine(endAfterStart)
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export type CreateWorkshopInput = z.infer<typeof createWorkshopSchema>;
export type UpdateWorkshopInput = z.infer<typeof updateWorkshopSchema>;
export type ListWorkshopsQuery = z.infer<typeof listWorkshopsQuery>;
export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
export type CreateCapabilityInput = z.infer<typeof createCapabilitySchema>;
export type UpdateCapabilityInput = z.infer<typeof updateCapabilitySchema>;
export type CreateCapacityInput = z.infer<typeof createCapacitySchema>;
export type UpdateCapacityInput = z.infer<typeof updateCapacitySchema>;
