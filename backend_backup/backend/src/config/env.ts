import 'dotenv/config';
import { z } from 'zod';

/**
 * Validates environment variables once at startup so the app fails fast with a
 * clear message instead of crashing later with a cryptic error.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
