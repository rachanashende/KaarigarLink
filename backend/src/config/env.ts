import 'dotenv/config';
import { z } from 'zod';

/**
 * Validates environment variables once at startup so the app fails fast with a
 * clear message instead of crashing later with a cryptic error.
 */

/**
 * Used ONLY outside production when CORS_ORIGINS is not set. These are the
 * origins of the two local Vite frontends (default port 5173): the workshop
 * app runs `vite` (localhost) and the buyer app runs `vite --host 127.0.0.1`.
 * Browsers treat localhost and 127.0.0.1 as different origins, so both are listed.
 * If both frontends run at once, Vite moves the second one to 5174: set
 * CORS_ORIGINS explicitly in that case.
 */
const DEV_DEFAULT_CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';

/** A browser Origin: scheme + host [+ port], no path, query or trailing slash. */
function isValidOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    CORS_ORIGINS: z.string().trim().optional(),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
    /** M12: local document storage root (outside any publicly served directory). */
    FILE_STORAGE_DIR: z.string().trim().min(1).default('storage/uploads'),
    /** M12: maximum size of one uploaded document, in bytes (default 10 MB). */
    MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).default(10 * 1024 * 1024),
    /**
     * Development-only one-click demo login (POST /api/auth/demo-login). Off unless exactly
     * "true", and honoured only when NODE_ENV is development. Never set it in production.
     */
    ENABLE_DEMO_LOGIN: z.enum(['true', 'false']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && data.ENABLE_DEMO_LOGIN === 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENABLE_DEMO_LOGIN'],
        message: 'ENABLE_DEMO_LOGIN must not be enabled in production (remove it or set it to false)',
      });
    }
    const raw = data.CORS_ORIGINS;
    if (data.NODE_ENV === 'production' && !raw) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS is required in production (comma-separated frontend origins, e.g. https://app.example.com)',
      });
      return;
    }
    if (!raw) return;
    for (const origin of raw.split(',').map((o) => o.trim()).filter(Boolean)) {
      if (origin === '*') {
        if (data.NODE_ENV === 'production') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ORIGINS'],
            message: '"*" is not allowed in production; list the frontend origins explicitly',
          });
        }
      } else if (!isValidOrigin(origin)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: `"${origin}" is not a valid origin (use scheme://host[:port], no path or trailing slash)`,
        });
      }
    }
  });

/** Pure parser (no exit), so the rules can be unit-tested. */
export function parseEnv(source: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  const data = parsed.data;
  const corsOrigins = (data.CORS_ORIGINS || DEV_DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    ok: true as const,
    env: {
      ...data,
      corsOrigins,
      isProduction: data.NODE_ENV === 'production',
      isTest: data.NODE_ENV === 'test',
      /** Demo login is available only in development with ENABLE_DEMO_LOGIN=true. */
      demoLoginEnabled: data.NODE_ENV === 'development' && data.ENABLE_DEMO_LOGIN === 'true',
    },
  };
}

const result = parseEnv(process.env);

if (!result.ok) {
  const issues = result.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  process.exit(1);
}

export const env = result.env;
