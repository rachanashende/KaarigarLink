
import type { Request, Response } from 'express';
import * as quoteService from '../services/quote.service';
import { sendSuccess } from '../utils/apiResponse';

export async function create(req: Request, res: Response) {
  const quote = await quoteService.createQuote(
    req.user!.id,
    req.params.invitationId as string,
    req.body,
  );
  sendSuccess(res, { quote }, 'Quote submitted successfully', 201);
}

export async function update(req: Request, res: Response) {
  const quote = await quoteService.updateQuote(
    req.user!.id,
    req.params.quoteId as string,
    req.body,
  );
  sendSuccess(res, { quote }, 'Quote updated successfully');
}

export async function listForJob(req: Request, res: Response) {
  const quotes = await quoteService.listQuotesForJob(
    req.user!.id,
    req.params.jobId as string,
  );
  sendSuccess(res, { quotes }, 'Job quotes fetched');
}

export async function mine(req: Request, res: Response) {
  const quotes = await quoteService.listMyQuotes(req.user!.id);
  sendSuccess(res, { quotes }, 'Your quotes fetched');
}
