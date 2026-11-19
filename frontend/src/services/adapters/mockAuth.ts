import { z } from 'zod';
import type { Role, User } from '@/types';
import { loginSchema, type AuthService } from '../auth';
import { ServiceError, type DataService } from '../contracts';

export const MOCK_SESSION_KEY = 'kaarigarlink.mock-session.v1';
export const DEMO_PASSWORD = 'DemoPass123!';
const sessionSchema = z.object({ version: z.literal(1), userId: z.string().min(1), expiresAt: z.number().finite() });
const roleSchema = z.enum(['buyer', 'workshop', 'inspector', 'admin']);
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// shortcut: this is a public demo identity switch, replace this adapter with backend authentication in Phase 7.
export function createMockAuthService(data: DataService, storage: () => SessionStorage = () => window.sessionStorage): AuthService {
  function access<T>(operation: (target: SessionStorage) => T): T {
    try { return operation(storage()); }
    catch { throw new ServiceError('SERVER', 'Session storage is unavailable. Allow site storage, then retry.'); }
  }
  async function establish(user: User): Promise<User> {
    access(target => target.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: user.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })));
    return user;
  }
  return {
    async login(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) throw new ServiceError('VALIDATION', 'Check your email and password.');
      const users = await data.list('users');
      const user = users.find(candidate => candidate.email.toLowerCase() === parsed.data.email);
      if (!user || parsed.data.password !== DEMO_PASSWORD) throw new ServiceError('UNAUTHORIZED', 'Email or password is incorrect. Use a demo account below.');
      return establish(user);
    },
    async demoLogin(role: Role) {
      if (!roleSchema.safeParse(role).success) throw new ServiceError('VALIDATION', 'Choose a valid demo role.');
      const users = await data.list('users');
      const user = users.find(candidate => candidate.role === role);
      if (!user) throw new ServiceError('NOT_FOUND', 'This demo account is unavailable.');
      return establish(user);
    },
    async restoreSession() {
      const raw = access(target => target.getItem(MOCK_SESSION_KEY));
      if (!raw) return null;
      let saved: unknown;
      try { saved = JSON.parse(raw); } catch { saved = null; }
      const parsed = sessionSchema.safeParse(saved);
      if (!parsed.success || parsed.data.expiresAt <= Date.now()) {
        access(target => target.removeItem(MOCK_SESSION_KEY));
        return null;
      }
      const users = await data.list('users');
      const user = users.find(candidate => candidate.id === parsed.data.userId) ?? null;
      if (!user) access(target => target.removeItem(MOCK_SESSION_KEY));
      return user;
    },
    async logout() { access(target => target.removeItem(MOCK_SESSION_KEY)); },
  };
}
