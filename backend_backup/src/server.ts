import { env } from './config/env';
import { app } from './app';
import { prisma } from './utils/prisma';

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`KaarigarLink API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
