import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@/types';
import type { AuthService, RegistrationInput } from '@/services/auth';
import { ErrorState, LoadingState } from '@/components/feedback';
import { AuthContext } from './context';

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    service.restoreSession().then(restored => {
      if (active) { setUser(restored); setBoot('ready'); }
    }).catch(() => { if (active) setBoot('error'); });
    return () => { active = false; };
  }, [service, attempt]);
  // Live mode: an expired or invalid JWT signs the user out everywhere, with a notice.
  useEffect(() => service.onSessionExpired?.(() => {
    queryClient.clear();
    setUser(null);
    setNotice('Your session has expired. Sign in again to continue.');
  }), [service, queryClient]);
  if (boot === 'loading') return <LoadingState label="Restoring your session…" />;
  if (boot === 'error') return <div className="mx-auto max-w-xl p-6"><ErrorState title="Unable to restore your session" message="Session storage or the authentication service is unavailable. Check site storage permissions and retry." onRetry={() => { setBoot('loading'); setAttempt(value => value + 1); }} /></div>;
  const register = service.register;
  return <AuthContext value={{
    user, notice, kind: service.kind ?? 'mock',
    async signIn(credentials) { const next = await service.login(credentials); queryClient.clear(); setNotice(null); setUser(next); return next; },
    async demoSignIn(role) { const next = await service.demoLogin(role); queryClient.clear(); setNotice(null); setUser(next); return next; },
    async signOut() { await service.logout(); queryClient.clear(); setUser(null); },
    async refreshUser() { const next = await service.restoreSession(); if (next) setUser(next); },
    ...(register ? { async register(input: RegistrationInput) { const next = await register.call(service, input); queryClient.clear(); setNotice(null); setUser(next); return next; } } : {}),
  }}>{children}</AuthContext>;
}
