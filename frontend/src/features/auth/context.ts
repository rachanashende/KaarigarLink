import { createContext, useContext } from 'react';
import type { User } from '@/types';
import type { AuthService } from '@/services/auth';
export interface AuthContextValue {
  user: User | null;
  signIn: AuthService['login'];
  demoSignIn: AuthService['demoLogin'];
  signOut: AuthService['logout'];
  /** "live" when backed by the Express API; "mock" for the demo identity switch. */
  kind: 'mock' | 'live';
  /** Present in live mode only. */
  register?: NonNullable<AuthService['register']>;
  /** A message for the sign-in page, e.g. after the session expired. */
  notice: string | null;
  /** Re-reads the signed-in user (e.g. after a profile change). */
  refreshUser: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
