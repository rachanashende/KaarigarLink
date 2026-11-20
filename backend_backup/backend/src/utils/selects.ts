import type { Prisma } from '@prisma/client';

/** Fields that are safe to return for a user. Never includes passwordHash. */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
  workshop: {
    select: {
      id: true,
      businessName: true,
      verificationStatus: true,
    },
  },
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
