import type { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { sendSuccess } from '../utils/apiResponse';

export async function award(req: Request, res: Response) {
  const { created, order } = await orderService.awardQuote(
    req.user!,
    req.params.quoteId as string,
  );

  if (created) sendSuccess(res, { created, order }, 'Quote awarded and order created', 201);
  else sendSuccess(res, { created, order }, 'Quote already awarded; existing order returned');
}

export async function getById(req: Request, res: Response) {
  const order = await orderService.getOrderById(
    req.user!,
    req.params.orderId as string,
  );

  sendSuccess(res, { order }, 'Order fetched successfully');
}

export async function mine(req: Request, res: Response) {
  const orders = await orderService.listMyOrders(req.user!);
  sendSuccess(res, { orders }, 'Your orders fetched');
}
