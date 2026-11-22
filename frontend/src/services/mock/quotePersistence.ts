import { z } from 'zod';
import type { Collections } from '@/types';
import { quoteTermsSchema, sameTerms } from '../workshopCommands';

const id = z.string().min(1).max(200);
export const quotesSchema = z.array(z.strictObject({
  id, jobId: id, workshopId: id, ...quoteTermsSchema.shape,
  notes: z.string().max(4000), status: z.enum(['SUBMITTED', 'AWARDED', 'REJECTED', 'WITHDRAWN']),
})).max(5000);

export function validateRestoredQuotes(state: Collections, seed: Collections) {
  const fail = () => { throw new Error('Invalid persisted quotation references or transitions'); };
  if (new Set(state.quotes.map(row => row.id)).size !== state.quotes.length ||
      new Set(state.quotes.map(row => row.jobId + '/' + row.workshopId)).size !== state.quotes.length) fail();
  for (const original of seed.quotes) {
    const row = state.quotes.find(item => item.id === original.id);
    if (!row || row.jobId !== original.jobId || row.workshopId !== original.workshopId) { fail(); continue; }
    if (original.status !== 'SUBMITTED' && (row.status !== original.status || !sameTerms(row, original))) fail();
    if (original.status === 'SUBMITTED' && !['SUBMITTED', 'WITHDRAWN'].includes(row.status)) fail();
  }
  for (const row of state.quotes) {
    const job = state.jobs.find(item => item.id === row.jobId);
    if (!job || !state.workshops.some(item => item.id === row.workshopId)) { fail(); continue; }
    const original = seed.quotes.find(item => item.id === row.id);
    const changed = !original || original.status !== row.status || !sameTerms(row, original);
    if (!changed) continue;
    const invitation = state.invitations.find(item => item.jobId === row.jobId && item.workshopId === row.workshopId);
    if (!['SUBMITTED', 'WITHDRAWN'].includes(row.status) || invitation?.status !== 'ACCEPTED' ||
        !['POSTED', 'QUOTING'].includes(job.status) || state.orders.some(item => item.jobId === job.id) ||
        state.quotes.some(item => item.jobId === job.id && item.status === 'AWARDED') || row.estimatedDelivery > job.deadline) fail();
  }
  for (const original of seed.invitations) {
    const row = state.invitations.find(item => item.id === original.id);
    if (!row || row.jobId !== original.jobId || row.workshopId !== original.workshopId ||
        (original.status !== 'PENDING' && row.status !== original.status)) fail();
  }
}
