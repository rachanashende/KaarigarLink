import type { Request, Response } from 'express';
import * as ratingService from '../services/rating.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';
import type { RatingHistoryQuery } from '../validators/rating.validator';

export async function submit(req: Request, res: Response) {
  const result = await ratingService.submitRating(req.user!, param(req, 'orderId'), req.body);
  sendSuccess(res, result, 'Rating submitted', 201);
}

export async function forWorkshop(req: Request, res: Response) {
  const result = await ratingService.getWorkshopRatings(param(req, 'id'), req.query as unknown as RatingHistoryQuery);
  sendSuccess(res, result, 'Workshop ratings fetched');
}
