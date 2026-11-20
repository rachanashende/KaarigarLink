import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { registerUser } from '../helpers/auth';

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/health', () => {
  it('reports healthy with database up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe('up');
  });
});

describe('POST /api/auth/register', () => {
  it('registers a buyer and returns a token without passwordHash', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Buyer One',
      email: 'buyer.one@test.com',
      password: 'Password123',
      role: 'BUYER',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: 'buyer.one@test.com', role: 'BUYER', workshop: null });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('registers a workshop user and creates the workshop profile', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Ravi Patil',
        email: 'ravi@precision.test',
        password: 'Password123',
        role: 'WORKSHOP',
        workshop: { businessName: 'Precision Works', city: 'Pune', latitude: 18.52, longitude: 73.85 },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.user.workshop).toMatchObject({
      businessName: 'Precision Works',
      verificationStatus: 'PENDING',
    });
    const ws = await prisma.workshop.findUnique({ where: { userId: res.body.data.user.id } });
    expect(ws?.latitude).toBe(18.52);
  });

  it('rejects duplicate email (case-insensitive) with 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Dup',
      email: 'BUYER.ONE@test.com',
      password: 'Password123',
      role: 'BUYER',
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects invalid input with 400 and field errors', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad', role: 'BUYER' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' }), expect.objectContaining({ field: 'password' })]),
    );
  });

  it('rejects ADMIN self-registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Sneaky',
      email: 'admin@test.com',
      password: 'Password123',
      role: 'ADMIN',
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Malformed JSON/);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'buyer.one@test.com', password: 'Password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects an invalid password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'buyer.one@test.com', password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('rejects an unknown email with the same 401 message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'Password123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const { token, user } = await registerUser('INSPECTOR');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: user.id, role: 'INSPECTOR' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('returns 401 when the token is missing', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication token missing');
  });

  it('returns 401 for a tampered token', async () => {
    const { token } = await registerUser('BUYER');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}x`);
    expect(res.status).toBe(401);
  });
});

describe('unknown routes', () => {
  it('returns 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
