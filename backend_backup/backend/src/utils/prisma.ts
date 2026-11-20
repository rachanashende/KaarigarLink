import { PrismaClient } from '@prisma/client';

// Single shared client. Re-using one instance avoids exhausting DB connections
// (important on Neon's free tier) and survives tsx watch reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
