import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServices } from './index';
import { createMockAuthService, MOCK_SESSION_KEY } from './adapters/mockAuth';
import { loginSchema } from './auth';
import { createMockService } from './adapters/mock';
import { createMockStore } from './mock/store';

beforeEach(() => sessionStorage.clear());
describe('mock authentication boundary', () => {
  it('normalizes email and validates credentials before reading users', async () => {
    expect(loginSchema.parse({ email: ' BUYER@kaarigarlink.example ', password: 'DemoPass123!' }).email).toBe('buyer@kaarigarlink.example');
    const data = createServices();
    const list = vi.spyOn(data, 'list');
    await expect(createMockAuthService(data).login({ email: 'invalid', password: 'short' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(list).not.toHaveBeenCalled();
  });
  it('persists only a version, id and expiry; restores canonical user and clears on logout', async () => {
    const auth = createMockAuthService(createServices());
    const user = await auth.login({ email: 'buyer@kaarigarlink.example', password: 'DemoPass123!' });
    const saved = JSON.parse(sessionStorage.getItem(MOCK_SESSION_KEY)!);
    expect(Object.keys(saved).sort()).toEqual(['expiresAt', 'userId', 'version']);
    expect(saved.userId).toBe(user.id);
    expect(await auth.restoreSession()).toEqual(user);
    await auth.logout();
    expect(await auth.restoreSession()).toBeNull();
  });
  it('never trusts a persisted role', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: 'buyer-1', role: 'admin', expiresAt: Date.now() + 60000 }));
    expect((await createMockAuthService(createServices()).restoreSession())?.role).toBe('buyer');
  });
  it.each(['invalid JSON', JSON.stringify({ version: 1 }), JSON.stringify({ version: 1, userId: 'buyer-1', expiresAt: 0 }), JSON.stringify({ version: 1, userId: 'missing', expiresAt: Date.now() + 60000 })])('rejects corrupt, expired or deleted-user sessions: %s', async raw => {
    sessionStorage.setItem(MOCK_SESSION_KEY, raw);
    expect(await createMockAuthService(createServices()).restoreSession()).toBeNull();
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull();
  });
  it('returns a real error for storage failure and does not establish a session', async () => {
    const auth = createMockAuthService(createServices(), () => { throw new Error('blocked'); });
    await expect(auth.demoLogin('buyer')).rejects.toMatchObject({ code: 'SERVER' });
    await expect(auth.restoreSession()).rejects.toMatchObject({ code: 'SERVER' });
    await expect(auth.logout()).rejects.toMatchObject({ code: 'SERVER' });
  });
  it('rejects incorrect passwords, unknown accounts and missing demo users', async () => {
    const store = createMockStore();
    const auth = createMockAuthService(createMockService(store));
    await expect(auth.login({ email: 'buyer@kaarigarlink.example', password: 'wrong-pass' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(auth.login({ email: 'unknown@kaarigarlink.example', password: 'DemoPass123!' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    store.commit(draft => { draft.users = []; });
    await expect(auth.demoLogin('admin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull();
  });
});
