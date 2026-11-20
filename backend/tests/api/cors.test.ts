import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';

// .env.test sets CORS_ORIGINS=http://localhost:5173.
describe('CORS', () => {
  it('runs with an explicit origin list in tests', () => {
    expect(env.corsOrigins).toContain('http://localhost:5173');
  });

  it('allows a configured origin (preflight)', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('does not allow an unknown origin', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still serves non-browser clients without an Origin header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe('up');
  });
});
