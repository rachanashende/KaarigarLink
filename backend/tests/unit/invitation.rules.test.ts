import { describe, expect, it } from 'vitest';
import {
  effectiveInvitationStatus,
  INVITATION_RESPONSE_WINDOW_DAYS,
  invitationExpiresAt,
  isPastExpiry,
} from '../../src/services/invitationExpiry';
import {
  inviteWorkshopSchema,
  jobInvitationsQuery,
  respondInvitationSchema,
  workshopInvitationsQuery,
} from '../../src/validators/invitation.validator';

const DAY = 86_400_000;
const created = new Date('2026-11-20T10:00:00.000Z');
const at = (days: number) => new Date(created.getTime() + days * DAY);

describe('invitation expiry (policy A2)', () => {
  it('uses a 7-day response window', () => {
    expect(INVITATION_RESPONSE_WINDOW_DAYS).toBe(7);
  });

  it('expires 7 days after creation when the deadline is later', () => {
    expect(invitationExpiresAt(created, at(30)).toISOString()).toBe(at(7).toISOString());
  });

  it('expires at the job deadline when that comes first', () => {
    expect(invitationExpiresAt(created, at(3)).toISOString()).toBe(at(3).toISOString());
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isPastExpiry(created, at(30), new Date(at(7).getTime() - 1))).toBe(false);
    expect(isPastExpiry(created, at(30), at(7))).toBe(true);
    expect(isPastExpiry(created, at(3), at(3))).toBe(true);
  });

  const openJob = { deadline: at(30), status: 'MATCHED' as const };

  it('only INVITED invitations become EXPIRED by time', () => {
    const late = at(10);
    expect(effectiveInvitationStatus('INVITED', created, openJob, late)).toBe('EXPIRED');
    expect(effectiveInvitationStatus('INVITED', created, openJob, at(1))).toBe('INVITED');
    expect(effectiveInvitationStatus('ACCEPTED', created, openJob, late)).toBe('ACCEPTED');
    expect(effectiveInvitationStatus('DECLINED', created, openJob, late)).toBe('DECLINED');
    expect(effectiveInvitationStatus('EXPIRED', created, openJob, at(1))).toBe('EXPIRED');
  });

  it('INVITED becomes EXPIRED as soon as the job leaves OPEN/MATCHED; other statuses are kept', () => {
    for (const status of ['AWARDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DRAFT'] as const) {
      const job = { deadline: at(30), status };
      expect(effectiveInvitationStatus('INVITED', created, job, at(1)), status).toBe('EXPIRED');
      expect(effectiveInvitationStatus('ACCEPTED', created, job, at(1)), status).toBe('ACCEPTED');
      expect(effectiveInvitationStatus('DECLINED', created, job, at(1)), status).toBe('DECLINED');
    }
    for (const status of ['OPEN', 'MATCHED'] as const) {
      expect(effectiveInvitationStatus('INVITED', created, { deadline: at(30), status }, at(1)), status).toBe('INVITED');
    }
  });
});

describe('invitation validators', () => {
  it('invite requires a workshopId and rejects extra fields', () => {
    expect(inviteWorkshopSchema.safeParse({ workshopId: 'ws-1' }).success).toBe(true);
    expect(inviteWorkshopSchema.safeParse({}).success).toBe(false);
    expect(inviteWorkshopSchema.safeParse({ workshopId: '  ' }).success).toBe(false);
    expect(inviteWorkshopSchema.safeParse({ workshopId: 'ws-1', matchScore: 100 }).success).toBe(false);
  });

  it('respond accepts only ACCEPTED or DECLINED with an optional note of up to 500 chars', () => {
    expect(respondInvitationSchema.safeParse({ response: 'ACCEPTED' }).success).toBe(true);
    expect(respondInvitationSchema.safeParse({ response: 'DECLINED', note: 'Fully booked' }).success).toBe(true);
    for (const response of ['INVITED', 'EXPIRED', 'accepted', 'maybe']) {
      expect(respondInvitationSchema.safeParse({ response }).success, response).toBe(false);
    }
    expect(respondInvitationSchema.safeParse({ response: 'ACCEPTED', note: 'x'.repeat(501) }).success).toBe(false);
    expect(respondInvitationSchema.safeParse({ response: 'ACCEPTED', status: 'ACCEPTED' }).success).toBe(false);
  });

  it('list queries validate status and pagination', () => {
    expect(jobInvitationsQuery.safeParse({ status: 'EXPIRED' }).success).toBe(true);
    expect(jobInvitationsQuery.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(workshopInvitationsQuery.parse({})).toEqual({ page: 1, limit: 20 });
    expect(workshopInvitationsQuery.safeParse({ limit: '500' }).success).toBe(false);
    expect(workshopInvitationsQuery.safeParse({ sort: 'x' }).success).toBe(false);
  });
});
