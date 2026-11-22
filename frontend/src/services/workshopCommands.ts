import { z } from 'zod';
import type { Collections, Invitation, Job, Quote } from '@/types';
import { todayInIndia } from './jobs';
import { ServiceError } from './contracts';

const amount = z.number({ error: 'Enter a numeric quoted total.' }).finite().positive('Quoted total must be greater than zero.').max(1_000_000_000, 'Quoted total exceeds the local mock limit.').multipleOf(0.01, 'Use at most two decimal places.');
export const quoteTermsSchema = z.strictObject({
  amount, estimatedDelivery: z.iso.date({ error: 'Enter a valid estimated delivery date.' }),
  notes: z.string().trim().max(4000, 'Use at most 4000 note characters.'),
});
const expectedTerms = quoteTermsSchema.extend({ notes: z.string().max(4000) });
export const invitationResponseSchema = z.strictObject({ response: z.enum(['ACCEPTED', 'DECLINED']) });
/** version: live mode only, the quote version last read (stale -> CONFLICT). */
export const editQuoteSchema = z.strictObject({ expected: expectedTerms, changes: quoteTermsSchema, version: z.string().min(1).optional() });
export const withdrawQuoteSchema = z.strictObject({ expected: expectedTerms, version: z.string().min(1).optional() });
export type QuoteTerms = z.infer<typeof quoteTermsSchema>;
export type InvitationResponse = z.infer<typeof invitationResponseSchema>;
export type EditQuoteInput = z.infer<typeof editQuoteSchema>;
export type WithdrawQuoteInput = z.infer<typeof withdrawQuoteSchema>;
export interface WorkshopCommands {
  respondToInvitation(actorId: string, invitationId: string, input: InvitationResponse): Promise<Invitation>;
  submitQuote(actorId: string, invitationId: string, input: QuoteTerms): Promise<Quote>;
  editQuote(actorId: string, quoteId: string, input: EditQuoteInput): Promise<Quote>;
  withdrawQuote(actorId: string, quoteId: string, input: WithdrawQuoteInput): Promise<Quote>;
}
// shortcut: value snapshots cannot detect ABA history or cross-tab races; use server revisions before live writes.
export function sameTerms(a: QuoteTerms, b: QuoteTerms) {
  return a.amount === b.amount && a.estimatedDelivery === b.estimatedDelivery && a.notes === b.notes;
}
export function jobCommandBlocker(state: Collections, job: Job | undefined): string {
  if (!job) return 'The referenced job is unavailable.';
  if (job.status === 'AWARDED' || state.orders.some(order => order.jobId === job.id) || state.quotes.some(quote => quote.jobId === job.id && quote.status === 'AWARDED')) return 'This job has already been awarded.';
  if (!['POSTED', 'QUOTING'].includes(job.status)) return 'This job is no longer open.';
  if (!z.iso.date().safeParse(job.deadline).success || job.deadline < todayInIndia()) return 'The job deadline has expired.';
  return '';
}
export function validateQuoteDelivery(terms: QuoteTerms, deadline: string) {
  if (terms.estimatedDelivery < todayInIndia()) throw new ServiceError('VALIDATION', 'Estimated delivery must be today or later (India time).');
  if (terms.estimatedDelivery > deadline) throw new ServiceError('VALIDATION', 'Estimated delivery cannot exceed the job deadline.');
}
export function invitationActions(state: Collections, invitation: Invitation) {
  const block = jobCommandBlocker(state, state.jobs.find(job => job.id === invitation.jobId));
  const responseReason = invitation.status !== 'PENDING' ? 'Only pending invitations can receive a response.' : block;
  const quoteReason = block || (invitation.status !== 'ACCEPTED' ? 'Accept this invitation before submitting a quotation.' : '') ||
    (state.quotes.some(quote => quote.jobId === invitation.jobId && quote.workshopId === invitation.workshopId) ? 'A quotation already exists for this job and workshop.' : '');
  return { respond: !responseReason, submitQuote: !quoteReason, responseReason, quoteReason };
}
export function quotationActions(state: Collections, quote: Quote) {
  const invitations = state.invitations.filter(item => item.jobId === quote.jobId && item.workshopId === quote.workshopId);
  const reason = (quote.status !== 'SUBMITTED' ? 'Only submitted quotations can be edited or withdrawn.' : '') ||
    jobCommandBlocker(state, state.jobs.find(job => job.id === quote.jobId)) ||
    (invitations.length !== 1 || invitations[0]?.status !== 'ACCEPTED' ? 'An accepted invitation is required.' : '');
  return { edit: !reason, withdraw: !reason, reason };
}
