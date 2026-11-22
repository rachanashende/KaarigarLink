import { createContext, useContext } from 'react';
import type { User } from '@/types';
import type { AuthService } from '@/services/auth';
export interface AuthContextValue {
  user: User | null;
  signIn: AuthService['login'];
  demoSignIn: AuthService['demoLogin'];
  signOut: AuthService['logout'];
}
export const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
