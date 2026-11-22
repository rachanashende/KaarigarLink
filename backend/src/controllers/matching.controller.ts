import type { Request, Response } from 'express';
import * as matchingService from '../services/matching.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';
import type { MatchesQuery } from '../validators/matching.validator';

export async function getJobMatches(req: Request, res: Response) {
  const data = await matchingService.getJobMatches(req.user!, param(req, 'id'), req.query as unknown as MatchesQuery);
  sendSuccess(res, data, data.eligibleCount > 0 ? 'Matching completed' : 'Matching completed: no eligible workshops');
}
