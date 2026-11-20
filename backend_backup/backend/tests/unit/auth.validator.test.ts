import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/validators/auth.validator';

const base = { name: 'Asha Rao', email: '  Asha@Example.COM ', password: 'Password123', role: 'BUYER' };

describe('registerSchema', () => {
  it('accepts a valid buyer and normalises email', () => {
    const parsed = registerSchema.parse(base);
    expect(parsed.email).toBe('asha@example.com');
  });

  it('rejects ADMIN self-registration', () => {
    expect(registerSchema.safeParse({ ...base, role: 'ADMIN' }).success).toBe(false);
  });

  it('rejects short passwords', () => {
    expect(registerSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
  });

  it('requires workshop details for WORKSHOP role', () => {
    const r = registerSchema.safeParse({ ...base, role: 'WORKSHOP' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(['workshop']);
  });

  it('rejects workshop details for non-workshop roles', () => {
    expect(registerSchema.safeParse({ ...base, workshop: { businessName: 'X Works' } }).success).toBe(false);
  });

  it('requires latitude and longitude together', () => {
    const r = registerSchema.safeParse({
      ...base,
      role: 'WORKSHOP',
      workshop: { businessName: 'Precision Works', latitude: 18.5 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    const r = registerSchema.safeParse({
      ...base,
      role: 'WORKSHOP',
      workshop: { businessName: 'Precision Works', latitude: 120, longitude: 73 },
    });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('rejects invalid email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});
