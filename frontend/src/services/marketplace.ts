import type { Invitation, Job, MatchResult, Quote, Workshop } from '@/types';

export interface WorkshopMatch {
  match: MatchResult;
  workshop: Workshop;
  invitation: Invitation | null;
  canInvite: boolean;
  invitationReason: string;
}
export interface BuyerMatchesData { job: Job; results: WorkshopMatch[] }
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
}
// No award command: Member 2 has not approved an award service or state-transition contract.
