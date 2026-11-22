import type { Collections } from '@/types';
import { ServiceError } from '../contracts';

export function requireBuyer(state: Collections, buyerId: string) {
  const actor = state.users.find(user => user.id === buyerId);
  if (!actor) throw new ServiceError('UNAUTHORIZED', 'Sign in to continue.');
  if (actor.role !== 'buyer') throw new ServiceError('FORBIDDEN', 'Only buyers can manage manufacturing jobs.');
}
export function ownedJob(state: Collections, buyerId: string, jobId: string) {
  requireBuyer(state, buyerId);
  const job = state.jobs.find(job => job.id === jobId && job.buyerId === buyerId);
  if (!job) throw new ServiceError('NOT_FOUND', 'This job is unavailable or does not belong to your account.');
  return job;
}
