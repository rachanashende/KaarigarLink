import type { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { sendSuccess } from '../utils/apiResponse';

export async function award(req: Request, res: Response) {
  const order = await orderService.awardQuote(
    req.user!.id,
    req.params.quoteId as string,
  );

  sendSuccess(res, { order }, 'Quote awarded and order created', 201);
}

export async function getById(req: Request, res: Response) {
  const order = await orderService.getOrderById(
    req.user!.id,
    req.params.orderId as string,
  );

  sendSuccess(res, { order }, 'Order fetched successfully');
}