import type { Collections, Invitation, Quote } from '@/types';
import { z } from 'zod';
import { ServiceError } from '../contracts';
import type { MockStore } from '../mock/store';
import { identity, one } from './mockWorkshopAccess';
import {
  editQuoteSchema, invitationResponseSchema, jobCommandBlocker, quotationActions, quoteTermsSchema,
  sameTerms, validateQuoteDelivery, withdrawQuoteSchema, type WorkshopCommands,
} from '../workshopCommands';

function checked<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError('VALIDATION', result.error.issues[0]?.message ?? 'Check the command fields.');
  return result.data;
}
function ownedInvitation(state: Collections, actor: string, id: string) {
  const { profile } = identity(state, actor);
  const rows = state.invitations.filter(item => item.id === id && item.workshopId === profile?.id);
  if (!rows.length) throw new ServiceError('NOT_FOUND', 'This invitation is unavailable.');
  const invitation = one(rows);
  one(state.invitations.filter(item => item.id === id));
  one(state.invitations.filter(item => item.jobId === invitation.jobId && item.workshopId === invitation.workshopId));
  const job = one(state.jobs.filter(item => item.id === invitation.jobId));
  one(state.users.filter(item => item.id === job.buyerId && item.role === 'buyer'));
  return { invitation, job };
}
function ownedQuote(state: Collections, actor: string, id: string) {
  const { profile } = identity(state, actor);
  const rows = state.quotes.filter(item => item.id === id && item.workshopId === profile?.id);
  if (!rows.length) throw new ServiceError('NOT_FOUND', 'This quotation is unavailable.');
  const quote = one(rows);
  one(state.quotes.filter(item => item.id === id));
  one(state.quotes.filter(item => item.jobId === quote.jobId && item.workshopId === quote.workshopId));
  const job = one(state.jobs.filter(item => item.id === quote.jobId));
  one(state.users.filter(item => item.id === job.buyerId && item.role === 'buyer'));
  return { quote, job };
}
function open(state: Collections, job: Collections['jobs'][number]) {
  const reason = jobCommandBlocker(state, job);
  if (reason) throw new ServiceError('CONFLICT', reason);
}
function audit(state: Collections, actorId: string, jobId: string, action: string) {
  state.auditEvents.push({ id: 'event-' + crypto.randomUUID(), actorId, entityId: jobId, entityType: 'Job', action, occurredAt: new Date().toISOString() });
}
function publicInvitation({ id, jobId, workshopId, status }: Invitation): Invitation { return { id, jobId, workshopId, status }; }
function publicQuote({ id, jobId, workshopId, amount, estimatedDelivery, notes, status }: Quote): Quote {
  return { id, jobId, workshopId, amount, estimatedDelivery, notes, status };
}
export function createMockWorkshopCommands(store: MockStore): WorkshopCommands {
  function ready() { if (store.warning) throw new ServiceError('SERVER', store.warning); }
  return {
    async respondToInvitation(actor, id, input) {
      const initial = ownedInvitation(store.snapshot(), actor, id);
      ready();
      const command = checked(invitationResponseSchema, input);
      if (initial.invitation.status === command.response) return publicInvitation(initial.invitation);
      let result = initial.invitation;
      store.commit(state => {
        const { invitation, job } = ownedInvitation(state, actor, id);
        if (invitation.status !== 'PENDING') throw new ServiceError('CONFLICT', 'This invitation has already received a response.');
        open(state, job);
        invitation.status = command.response;
        audit(state, actor, job.id, 'MOCK_INVITATION_' + command.response);
        result = invitation;
      });
      return publicInvitation(result);
    },
    async submitQuote(actor, id, input) {
      ownedInvitation(store.snapshot(), actor, id);
      ready();
      const terms = checked(quoteTermsSchema, input);
      const apply = (state: Collections, write: boolean): Quote | undefined => {
        const { invitation, job } = ownedInvitation(state, actor, id);
        open(state, job);
        if (invitation.status !== 'ACCEPTED') throw new ServiceError('CONFLICT', 'Accept this invitation before submitting a quotation.');
        validateQuoteDelivery(terms, job.deadline);
        const existing = state.quotes.filter(quote => quote.jobId === job.id && quote.workshopId === invitation.workshopId);
        if (existing.length) {
          const quote = one(existing);
          if (quote.status === 'SUBMITTED' && sameTerms(quote, terms)) return quote;
          throw new ServiceError('CONFLICT', 'A quotation already exists for this job and workshop.');
        }
        if (!write) return undefined;
        const quote: Quote = { id: 'mock-quote-' + crypto.randomUUID(), jobId: job.id, workshopId: invitation.workshopId, ...terms, status: 'SUBMITTED' };
        state.quotes.push(quote);
        audit(state, actor, job.id, 'MOCK_QUOTE_SUBMITTED');
        return quote;
      };
      const existing = apply(store.snapshot(), false);
      if (existing) return publicQuote(existing);
      let result: Quote | undefined;
      store.commit(state => { result = apply(state, true); });
      return publicQuote(result!);
    },
    async editQuote(actor, id, input) {
      ownedQuote(store.snapshot(), actor, id);
      ready();
      const command = checked(editQuoteSchema, input);
      const apply = (state: Collections, write: boolean) => {
        const { quote, job } = ownedQuote(state, actor, id);
        const reason = quotationActions(state, quote).reason;
        if (reason) throw new ServiceError('CONFLICT', reason);
        validateQuoteDelivery(command.changes, job.deadline);
        if (sameTerms(quote, command.changes)) return quote;
        if (!sameTerms(quote, command.expected)) throw new ServiceError('CONFLICT', 'This quotation changed. Reload its latest terms before editing.');
        if (write) { Object.assign(quote, command.changes); audit(state, actor, job.id, 'MOCK_QUOTE_EDITED'); }
        return quote;
      };
      const before = apply(store.snapshot(), false);
      if (sameTerms(before, command.changes)) return publicQuote(before);
      let result = before;
      store.commit(state => { result = apply(state, true); });
      return publicQuote(result);
    },
    async withdrawQuote(actor, id, input) {
      ownedQuote(store.snapshot(), actor, id);
      ready();
      const command = checked(withdrawQuoteSchema, input);
      const apply = (state: Collections, write: boolean) => {
        const { quote, job } = ownedQuote(state, actor, id);
        if (!sameTerms(quote, command.expected)) throw new ServiceError('CONFLICT', 'This quotation changed. Reload its latest terms before withdrawing.');
        if (quote.status === 'WITHDRAWN') return quote;
        const reason = quotationActions(state, quote).reason;
        if (reason) throw new ServiceError('CONFLICT', reason);
        if (write) { quote.status = 'WITHDRAWN'; audit(state, actor, job.id, 'MOCK_QUOTE_WITHDRAWN'); }
        return quote;
      };
      const before = apply(store.snapshot(), false);
      if (before.status === 'WITHDRAWN') return publicQuote(before);
      let result = before;
      store.commit(state => { result = apply(state, true); });
      return publicQuote(result);
    },
  };
}
