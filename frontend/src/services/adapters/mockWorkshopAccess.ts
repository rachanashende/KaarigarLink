import type { Collections, User } from '@/types';
import { ServiceError } from '../contracts';

export function one<T>(rows: T[]): T {
  if (rows.length !== 1) throw new ServiceError('SERVER', 'Workshop records contain incomplete or ambiguous references. Reset demo data or correct the shared source.');
  return rows[0]!;
}
export function identity(state: Collections, actor: string) {
  const users = state.users.filter(user => user.id === actor);
  if (!users.length) throw new ServiceError('UNAUTHORIZED', 'Sign in to view your workshop.');
  const user = one(users);
  if (user.role !== 'workshop') throw new ServiceError('FORBIDDEN', 'A workshop account is required.');
  const profiles = state.workshops.filter(profile => profile.ownerId === user.id);
  if (profiles.length > 1) throw new ServiceError('CONFLICT', 'This account has multiple workshop profiles. Resolve the ownership mapping before continuing.');
  const profile = profiles[0] ?? null;
  if (profile) one(state.workshops.filter(row => row.id === profile.id));
  return { account: accountView(user), profile };
}
function accountView({ id, name, email, role }: User): User { return { id, name, email, role }; }
