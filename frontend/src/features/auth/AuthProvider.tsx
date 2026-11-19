import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@/types';
import type { AuthService } from '@/services/auth';
import { ErrorState, LoadingState } from '@/components/feedback';
import { AuthContext } from './context';

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    service.restoreSession().then(restored => {
      if (active) { setUser(restored); setBoot('ready'); }
    }).catch(() => { if (active) setBoot('error'); });
    return () => { active = false; };
  }, [service, attempt]);
  if (boot === 'loading') return <LoadingState label="Restoring your session…" />;
  if (boot === 'error') return <div className="mx-auto max-w-xl p-6"><ErrorState title="Unable to restore your session" message="Session storage or the authentication service is unavailable. Check site storage permissions and retry." onRetry={() => { setBoot('loading'); setAttempt(value => value + 1); }} /></div>;
  return <AuthContext value={{
    user,
    async signIn(credentials) { const next = await service.login(credentials); queryClient.clear(); setUser(next); return next; },
    async demoSignIn(role) { const next = await service.demoLogin(role); queryClient.clear(); setUser(next); return next; },
    async signOut() { await service.logout(); queryClient.clear(); setUser(null); },
  }}>{children}</AuthContext>;
}
