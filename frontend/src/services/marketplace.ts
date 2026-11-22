import type { Invitation, Job, MatchResult, Quote, Workshop } from '@/types';

export interface WorkshopMatch {
  match: MatchResult;
  workshop: Workshop;
  invitation: Invitation | null;
  canInvite: boolean;
  invitationReason: string;
}
/** source (live mode): 'live' = matching computed now; 'snapshot' = scores stored when each invitation was sent. */
export interface BuyerMatchesData { job: Job; results: WorkshopMatch[]; source?: 'live' | 'snapshot' }
export interface WorkshopQuote {
  quote: Quote;
  workshop: Workshop;
  canReviewAward: boolean;
  reviewReason: string;
}
export interface BuyerQuotesData {
  job: Job;
  quotations: WorkshopQuote[];
  awardBlocker: string;
}
export interface BuyerMarketplaceService {
  getMatches(buyerId: string, jobId: string): Promise<BuyerMatchesData>;
  inviteWorkshop(buyerId: string, jobId: string, workshopId: string): Promise<Invitation>;
  getQuotes(buyerId: string, jobId: string): Promise<BuyerQuotesData>;
  /** Live mode only: award a SUBMITTED quote (creates the order). The mock workspace keeps awarding disabled. */
  awardQuote?(buyerId: string, quoteId: string): Promise<{ orderId: string }>;
}
