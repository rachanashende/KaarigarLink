import request from 'supertest';
import { app } from '../../src/app';

let counter = 0;

/** Registers a user via the real API and returns { token, user }. */
export async function registerUser(
  role: 'BUYER' | 'WORKSHOP' | 'INSPECTOR',
  overrides: Record<string, unknown> = {},
) {
  counter += 1;
  const body = {
    name: `Test ${role} ${counter}`,
    email: `${role.toLowerCase()}${counter}.${Date.now()}@test.com`,
    password: 'Password123',
    role,
    ...(role === 'WORKSHOP' && {
      workshop: { businessName: `Workshop ${counter}`, latitude: 18.52, longitude: 73.85 },
    }),
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.token as string, user: res.body.data.user, password: body.password };
}
