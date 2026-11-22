import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_SECRET: 'a-long-enough-test-secret' };
const issues = (r: ReturnType<typeof parseEnv>) => (r.ok ? [] : r.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

describe('parseEnv - CORS rules', () => {
  it('defaults to the two local Vite frontend origins outside production', () => {
    for (const NODE_ENV of ['development', 'test'] as const) {
      const r = parseEnv({ ...base, NODE_ENV });
      expect(r.ok && r.env.corsOrigins, NODE_ENV).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
    }
  });

  it('lets developers override the default (e.g. both frontends running, second on 5174)', () => {
    const r = parseEnv({
      ...base,
      NODE_ENV: 'development',
      CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174',
    });
    expect(r.ok && r.env.corsOrigins).toHaveLength(4);
  });

  it('requires CORS_ORIGINS in production (no silent localhost default)', () => {
    const r = parseEnv({ ...base, NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
    expect(issues(r).join()).toMatch(/CORS_ORIGINS is required in production/);
  });

  it('accepts explicit, trimmed origins in production', () => {
    const r = parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: ' https://app.example.com , https://admin.example.com:8443 ' });
    expect(r.ok && r.env.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com:8443']);
  });

  it('rejects "*" in production but allows it locally', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: '*' }).ok).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'development', CORS_ORIGINS: '*' }).ok).toBe(true);
  });

  it.each(['https://app.example.com/', 'https://app.example.com/path', 'app.example.com', 'ftp://app.example.com'])(
    'rejects malformed origin %s',
    (origin) => {
      const r = parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: origin });
      expect(r.ok).toBe(false);
      expect(issues(r).join()).toMatch(/is not a valid origin/);
    },
  );
});

describe('parseEnv - secrets and basics', () => {
  it('requires DATABASE_URL and JWT_SECRET from the environment', () => {
    const r = parseEnv({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' });
    expect(issues(r).join()).toMatch(/DATABASE_URL/);
    expect(issues(r).join()).toMatch(/JWT_SECRET/);
  });

  it('uses PORT from the environment (Render sets it)', () => {
    const r = parseEnv({ ...base, PORT: '10000' });
    expect(r.ok && r.env.PORT).toBe(10000);
  });
});
