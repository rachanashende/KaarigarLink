import { z } from 'zod';
import type { User } from '@/types';
import { loginSchema, registerSchema, type AuthService } from '../auth';
import { ServiceError } from '../contracts';
import { api, session } from './http';
import { authResultSchema, userSchema, userView } from './mappers';

/**
 * Backend JWT authentication (POST /auth/login, POST /auth/register, GET /auth/me).
 * The token lives in sessionStorage (survives a refresh, cleared when the tab
 * closes or on logout). Roles come from the backend; the UI never chooses them.
 */
export function createLiveAuthService(): AuthService {
  function establish(result: z.infer<typeof authResultSchema>): User {
    const user = userView(result.user);
    session.start(result.token, user);
    return user;
  }
  return {
    kind: 'live',
    async login(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) throw new ServiceError('VALIDATION', 'Check your email and password.');
      return establish(await api('/auth/login', authResultSchema, { method: 'POST', body: parsed.data, auth: false }));
    },
    async register(input) {
      const parsed = registerSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your registration details.');
      const { role, businessName, city, ...account } = parsed.data;
      const body = {
        ...account,
        role: role.toUpperCase(),
        ...(role === 'workshop' ? { workshop: { businessName: businessName ?? '', ...(city ? { city } : {}) } } : {}),
      };
      return establish(await api('/auth/register', authResultSchema, { method: 'POST', body, auth: false }));
    },
    /**
     * Development-only one-click demo login: POST /auth/demo-login with just the role. The
     * backend decides whether demo login is enabled, picks the seeded account and issues a
     * normal token; the session starts exactly as after a password login. No password or
     * token lives in the frontend.
     */
    async demoLogin(role) {
      return establish(await api('/auth/demo-login', authResultSchema, { method: 'POST', body: { role: role.toUpperCase() }, auth: false }));
    },
    async restoreSession() {
      if (!session.token()) return null;
      try {
        const { user } = await api('/auth/me', z.object({ user: userSchema }));
        const view = userView(user);
        session.setUser(view);
        return view;
      } catch (error) {
        // An expired or invalid token was already cleared by api(); report "signed out".
        if (error instanceof ServiceError && error.code === 'UNAUTHORIZED') return null;
        throw error;
      }
    },
    async logout() { session.clear(); },
    onSessionExpired(listener) { return session.onExpired(listener); },
  };
}
