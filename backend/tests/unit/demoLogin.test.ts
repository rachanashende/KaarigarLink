import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';
import { demoLoginAvailable, isLocalRequest } from '../../src/middleware/demoLoginGuard';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_SECRET: 'a-long-enough-test-secret' };
const enabled = (source: Record<string, string>) => {
  const r = parseEnv({ ...base, ...source });
  return r.ok ? r.env.demoLoginEnabled : 'invalid';
};

describe('demo login configuration', () => {
  it('is disabled by default and when ENABLE_DEMO_LOGIN is false', () => {
    expect(enabled({ NODE_ENV: 'development' })).toBe(false);
    expect(enabled({ NODE_ENV: 'development', ENABLE_DEMO_LOGIN: 'false' })).toBe(false);
  });
  it('is enabled only in development with ENABLE_DEMO_LOGIN=true', () => {
    expect(enabled({ NODE_ENV: 'development', ENABLE_DEMO_LOGIN: 'true' })).toBe(true);
    expect(enabled({ NODE_ENV: 'test', ENABLE_DEMO_LOGIN: 'true' })).toBe(false);
  });
  it('refuses to start in production with ENABLE_DEMO_LOGIN=true; false is allowed', () => {
    const r = parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com', ENABLE_DEMO_LOGIN: 'true' });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.issues.map((i) => i.message).join()).toMatch(/must not be enabled in production/);
    expect(enabled({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com', ENABLE_DEMO_LOGIN: 'false' })).toBe(false);
  });
  it('rejects values other than true/false (no "1" or "yes" surprises)', () => {
    expect(enabled({ NODE_ENV: 'development', ENABLE_DEMO_LOGIN: 'yes' })).toBe('invalid');
  });
  it('the gate re-checks NODE_ENV at request time', () => {
    expect(demoLoginAvailable({ NODE_ENV: 'development', demoLoginEnabled: true })).toBe(true);
    expect(demoLoginAvailable({ NODE_ENV: 'production', demoLoginEnabled: true })).toBe(false);
    expect(demoLoginAvailable({ NODE_ENV: 'test', demoLoginEnabled: true })).toBe(false);
    expect(demoLoginAvailable({ NODE_ENV: 'development', demoLoginEnabled: false })).toBe(false);
  });
});

describe('local-only requests', () => {
  const req = (remoteAddress: string, headers: Record<string, string>) => ({ socket: { remoteAddress }, headers }) as unknown as Parameters<typeof isLocalRequest>[0];
  it('accepts loopback peers with a local Host and a local or missing Origin', () => {
    expect(isLocalRequest(req('127.0.0.1', { host: 'localhost:4000', origin: 'http://localhost:5173' }))).toBe(true);
    expect(isLocalRequest(req('::1', { host: '127.0.0.1:4000', origin: 'http://127.0.0.1:5173' }))).toBe(true);
    expect(isLocalRequest(req('::ffff:127.0.0.1', { host: '[::1]:4000' }))).toBe(true);
  });
  it('rejects remote peers, even with a spoofed X-Forwarded-For', () => {
    expect(isLocalRequest(req('192.168.1.20', { host: 'localhost:4000', 'x-forwarded-for': '127.0.0.1' }))).toBe(false);
    expect(isLocalRequest(req('10.0.0.5', { host: '127.0.0.1:4000' }))).toBe(false);
  });
  it('rejects non-local Host headers (DNS rebinding) and non-local or malformed Origins', () => {
    expect(isLocalRequest(req('127.0.0.1', { host: 'evil.example:4000' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', {}))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', { host: 'localhost:4000', origin: 'https://evil.example' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', { host: 'localhost:4000', origin: 'http://localhost.evil.example' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', { host: 'localhost:4000', origin: 'null' }))).toBe(false);
  });
});
