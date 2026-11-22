/**
 * Quotations (Member 2's workflow, I2 rules applied in integration).
 *
 * Eligibility to submit or edit a quote:
 *   - the caller's workshop owns the invitation (others get 404, like M8),
 *   - the invitation is ACCEPTED (INVITED must be accepted first; DECLINED and
 *     EXPIRED are closed),
 *   - the job is OPEN or MATCHED and its deadline has not passed,
 *   - for edits, the quote is still SUBMITTED.
 *
 * Concurrency: overdue INVITED invitations are first saved as EXPIRED with the
 * M8 helper (committed on its own, like respondToInvitation). The write itself
 * then runs in one transaction that locks rows in the same order as the rest
 * of the backend - Job first, then JobInvitation, then Quote. The Job row is taken FOR SHARE, so quote writes for the same job can
 * run in parallel while anything that changes the job (cancellation, award,
 * any job update) waits for them or makes them wait. After a wait, the locking
 * read returns the committed row, so a quote is never written against a job or
 * invitation state that has already changed.
 */
import { Prisma, type InvitationStatus, type JobStatus, type Quote, type QuoteStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { getMyWorkshopId } from './workshop.service';
import { effectiveInvitationStatus, expireOverdueInvitations, type InvitationJobState } from './invitationExpiry';
import type { CreateQuoteInput, UpdateQuoteInput } from '../validators/quote.validator';

/** Job states that still accept quotes (same as the states an invitation can be answered in). */
export const QUOTABLE_JOB_STATUSES: JobStatus[] = ['OPEN', 'MATCHED'];

type Tx = Prisma.TransactionClient;

// ---------- Serialiser ----------

/** Money leaves the API as an exact 2-decimal string, e.g. "12500.50". */
function quoteView<T extends Quote>(quote: T) {
  return { ...quote, totalPrice: quote.totalPrice.toFixed(2) };
}

// ---------- Shared state checks (run under the locks) ----------

const invitationNotFound = () => ApiError.notFound('Invitation not found');
const quoteNotFound = () => ApiError.notFound('Quote not found');
const duplicateQuote = () => ApiError.conflict('A quote already exists for this invitation; update it instead');

const INVITATION_CLOSED: Record<Exclude<InvitationStatus, 'ACCEPTED'>, string> = {
  INVITED: 'Accept the invitation before submitting a quote',
  DECLINED: 'The invitation was declined; quotes are not allowed',
  EXPIRED: 'The invitation has expired; quotes are not allowed',
};

/** Locks the job FOR SHARE and checks it still accepts quotes. Always the first lock taken. */
async function lockQuotableJob(tx: Tx, jobId: string, now: Date): Promise<InvitationJobState> {
  const rows = await tx.$queryRaw<InvitationJobState[]>`
    SELECT "status", "deadline" FROM "Job" WHERE "id" = ${jobId} FOR SHARE`;
  const job = rows[0];
  if (!job) throw ApiError.notFound('Job not found');
  if (!QUOTABLE_JOB_STATUSES.includes(job.status)) {
    throw ApiError.conflict(`This job is no longer accepting quotes (status ${job.status})`);
  }
  if (job.deadline.getTime() <= now.getTime()) {
    throw ApiError.conflict('The job deadline has passed; quotes are no longer accepted');
  }
  return job;
}

/**
 * Locks the invitation FOR SHARE (second lock) and requires ACCEPTED. The
 * status is judged with the M8 rule (effectiveInvitationStatus), so an INVITED
 * invitation that went overdue after the lazy-expiry write still reads EXPIRED.
 */
async function lockAcceptedInvitation(tx: Tx, invitationId: string, job: InvitationJobState, now: Date) {
  const rows = await tx.$queryRaw<{ status: InvitationStatus; createdAt: Date }[]>`
    SELECT "status", "createdAt" FROM "JobInvitation" WHERE "id" = ${invitationId} FOR SHARE`;
  const row = rows[0];
  if (!row) throw invitationNotFound();
  const status = effectiveInvitationStatus(row.status, row.createdAt, job, now);
  if (status !== 'ACCEPTED') throw ApiError.conflict(INVITATION_CLOSED[status]);
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// ---------- Job cancellation ----------

/**
 * I3: when a job is cancelled, its SUBMITTED quotes become CANCELLED. Other
 * statuses (ACCEPTED, REJECTED, WITHDRAWN, CANCELLED) never change. Call it
 * inside the cancellation transaction, after the job row has been written and
 * its invitations expired, which keeps the lock order job -> invitations ->
 * quotes. A quote submitted at the same moment holds the job FOR SHARE, so the
 * cancellation's job write waits for it, and this statement (which starts
 * afterwards) also catches that quote. Returns how many quotes were cancelled.
 */
export async function cancelSubmittedQuotes(jobId: string, db: Pick<typeof prisma, 'quote'> = prisma): Promise<number> {
  const { count } = await db.quote.updateMany({
    where: { jobId, status: 'SUBMITTED' },
    data: { status: 'CANCELLED' },
  });
  return count;
}

// ---------- Workshop: submit ----------

export async function createQuote(user: AuthUser, invitationId: string, input: CreateQuoteInput) {
  const workshopId = await getMyWorkshopId(user);
  const invitation = await prisma.jobInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, jobId: true, workshopId: true },
  });
  // Another workshop's invitation looks non-existent (same convention as M8).
  if (!invitation || invitation.workshopId !== workshopId) throw invitationNotFound();

  const now = new Date();
  // M8 lazy expiry, committed on its own (as in respondToInvitation) so an overdue
  // invitation is saved as EXPIRED even though this request is then rejected.
  await expireOverdueInvitations({ id: invitationId }, now);
  try {
    const quote = await prisma.$transaction(async (tx) => {
      const job = await lockQuotableJob(tx, invitation.jobId, now);
      await lockAcceptedInvitation(tx, invitationId, job, now);

      const existing = await tx.quote.findUnique({ where: { invitationId }, select: { id: true } });
      if (existing) throw duplicateQuote();

      // The unique invitationId index is the final guard against a parallel submission.
      return tx.quote.create({
        data: {
          invitationId,
          jobId: invitation.jobId,
          workshopId,
          totalPrice: input.totalPrice,
          estimatedDays: input.estimatedDays,
          notes: input.notes,
          validUntil: input.validUntil,
        },
      });
    });
    return quoteView(quote);
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateQuote();
    throw err;
  }
}

// ---------- Workshop: edit ----------

export async function updateQuote(user: AuthUser, quoteId: string, input: UpdateQuoteInput) {
  const workshopId = await getMyWorkshopId(user);
  const found = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, jobId: true, invitationId: true, workshopId: true },
  });
  if (!found || found.workshopId !== workshopId) throw quoteNotFound();

  const now = new Date();
  await expireOverdueInvitations({ id: found.invitationId }, now);
  const quote = await prisma.$transaction(async (tx) => {
    const job = await lockQuotableJob(tx, found.jobId, now);
    await lockAcceptedInvitation(tx, found.invitationId, job, now);

    const rows = await tx.$queryRaw<{ status: QuoteStatus; updatedAt: Date }[]>`
      SELECT "status", "updatedAt" FROM "Quote" WHERE "id" = ${quoteId} FOR UPDATE`;
    const current = rows[0];
    if (!current) throw quoteNotFound();
    if (current.status !== 'SUBMITTED') {
      throw ApiError.conflict(`Only SUBMITTED quotes can be edited (this quote is ${current.status})`);
    }

    return tx.quote.update({
      where: { id: quoteId },
      data: {
        ...input,
        // Strictly later than the version read, so updatedAt always advances (same rule as jobs).
        updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
      },
    });
  });
  return quoteView(quote);
}

// ---------- Buyer: quotes for my job ----------

export async function listQuotesForJob(user: AuthUser, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, buyerId: true } });
  // Other buyers' jobs look non-existent (same convention as jobs/invitations).
  if (!job || job.buyerId !== user.id) throw ApiError.notFound('Job not found');

  const quotes = await prisma.quote.findMany({
    where: { jobId },
    include: { workshop: { select: { id: true, businessName: true, rating: true, city: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return quotes.map(quoteView);
}

// ---------- Workshop: my quotes ----------

export async function listMyQuotes(user: AuthUser) {
  const workshopId = await getMyWorkshopId(user);
  const quotes = await prisma.quote.findMany({
    where: { workshopId },
    include: { job: { select: { id: true, title: true, status: true, deadline: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return quotes.map(quoteView);
}
