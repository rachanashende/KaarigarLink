import { z } from 'zod';
import { InvitationStatus } from '@prisma/client';

export const invitationIdParams = z.object({ id: z.string().min(1) });

export const inviteWorkshopSchema = z
  .object({ workshopId: z.string().trim().min(1, 'workshopId is required') })
  .strict();

export const respondInvitationSchema = z
  .object({
    response: z.enum(['ACCEPTED', 'DECLINED'], {
      errorMap: () => ({ message: 'response must be ACCEPTED or DECLINED' }),
    }),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const jobInvitationsQuery = z.object({ status: z.nativeEnum(InvitationStatus).optional() }).strict();

export const workshopInvitationsQuery = z
  .object({
    status: z.nativeEnum(InvitationStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type InviteWorkshopInput = z.infer<typeof inviteWorkshopSchema>;
export type RespondInvitationInput = z.infer<typeof respondInvitationSchema>;
export type JobInvitationsQuery = z.infer<typeof jobInvitationsQuery>;
export type WorkshopInvitationsQuery = z.infer<typeof workshopInvitationsQuery>;
