import type { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

/** GET /api/health - used by Render health checks and teammates. */
export async function health(_req: Request, res: Response) {
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }

  const ok = database === 'up';
  res.status(ok ? 200 : 503).json({
    success: ok,
    message: ok ? 'Service healthy' : 'Database unreachable',
    data: {
      status: ok ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}
