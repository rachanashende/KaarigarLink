import { z } from 'zod';
import type { Collections, Invitation, Job } from '@/types';
import { ServiceError } from '../contracts';
import type { BuyerMarketplaceService } from '../marketplace';
import type { MockStore } from '../mock/store';
import { ownedJob } from './mockBuyerAccess';

function workshopFor(state: Collections, id: string) {
  const workshop = state.workshops.find(workshop => workshop.id === id);
  if (!workshop) throw new ServiceError('SERVER', 'A referenced workshop is unavailable. Please retry.');
  return workshop;
}
function jobRestriction(state: Collections, job: Job): string {
  if (job.status === 'AWARDED' || state.orders.some(order => order.jobId === job.id) || state.quotes.some(quote => quote.jobId === job.id && quote.status === 'AWARDED')) return 'This job has already been awarded.';
  if (job.status !== 'POSTED' && job.status !== 'QUOTING') return 'This job is no longer open.';
  return '';
}
function invitationReason(state: Collections, job: Job, workshopId: string): string {
  const existing = state.invitations.find(invitation => invitation.jobId === job.id && invitation.workshopId === workshopId);
  if (existing) return 'An invitation is already recorded for this workshop.';
  const restriction = jobRestriction(state, job);
  if (restriction) return restriction;
  const match = state.matches.find(match => match.jobId === job.id && match.workshopId === workshopId);
  if (!match?.eligibility.eligible) return match?.eligibility.reasons.join(' ') || 'This workshop is not eligible for this job.';
  return '';
}
export function createMockMarketplace(store: MockStore): BuyerMarketplaceService {
  return {
    async getMatches(buyerId, jobId) {
      const state = store.snapshot();
      const job = ownedJob(state, buyerId, jobId);
      // Fixture order is the service's ranking; never generate or recalculate scores here.
      return { job, results: state.matches.filter(match => match.jobId === jobId).map(match => {
        const reason = invitationReason(state, job, match.workshopId);
        return { match, workshop: workshopFor(state, match.workshopId), invitation: state.invitations.find(invitation => invitation.jobId === jobId && invitation.workshopId === match.workshopId) ?? null, canInvite: !reason, invitationReason: reason };
      }) };
    },
    async inviteWorkshop(buyerId, jobId, workshopId) {
      let result: Invitation | undefined;
      store.commit(state => {
        const job = ownedJob(state, buyerId, jobId);
        workshopFor(state, workshopId);
        const existing = state.invitations.find(invitation => invitation.jobId === jobId && invitation.workshopId === workshopId);
        if (existing) { result = existing; return; }
        const reason = invitationReason(state, job, workshopId);
        if (reason) throw new ServiceError('CONFLICT', reason);
        result = { id: 'invitation-' + crypto.randomUUID(), jobId, workshopId, status: 'PENDING' };
        state.invitations.push(result);
        state.auditEvents.push({ id: 'event-' + crypto.randomUUID(), actorId: buyerId, entityId: jobId, entityType: 'Job', action: 'WORKSHOP_INVITED', occurredAt: new Date().toISOString() });
      });
      return structuredClone(result!);
    },
    async getQuotes(buyerId, jobId) {
      const state = store.snapshot();
      const job = ownedJob(state, buyerId, jobId);
      return {
        job,
        awardBlocker: 'Order awarding is not available in this demo. You can review quotations, but no order will be created.',
        quotations: state.quotes.filter(quote => quote.jobId === jobId).map(quote => {
          const match = state.matches.find(match => match.jobId === jobId && match.workshopId === quote.workshopId);
          const reason = jobRestriction(state, job) ||
            (quote.status !== 'SUBMITTED' ? 'Only submitted quotations can be reviewed for award.' : '') ||
            (!match?.eligibility.eligible ? 'This workshop is not eligible for this job.' : '') ||
            (!Number.isFinite(quote.amount) || quote.amount <= 0 ? 'The quoted amount is invalid.' : '') ||
            (!z.iso.date().safeParse(quote.estimatedDelivery).success ? 'The quoted delivery date is invalid.' : '');
          return { quote, workshop: workshopFor(state, quote.workshopId), canReviewAward: !reason, reviewReason: reason };
        }),
      };
    },
  };
}
