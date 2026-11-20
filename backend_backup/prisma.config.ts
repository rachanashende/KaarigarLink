// Prisma CLI configuration. When this file exists Prisma does NOT auto-load .env,
// so we load it here. Existing environment variables (e.g. from Render or the
// test runner) always take precedence over .env values.
import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Multi-file schema: every *.prisma file in this folder is merged.
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
