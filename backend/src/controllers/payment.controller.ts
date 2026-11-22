import type { Request, Response } from 'express';
import * as paymentService from '../services/payment.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';

/** Payments are simulated: no payment gateway is called and no money moves. */
export async function create(req: Request, res: Response) {
  const result = await paymentService.createPayment(req.user!, param(req, 'orderId'), req.body);
  sendSuccess(res, result, 'Payment created (PENDING, simulated)', 201);
}

export async function simulate(req: Request, res: Response) {
  const result = await paymentService.simulatePaymentResult(req.user!, param(req, 'paymentId'), req.body);
  sendSuccess(
    res,
    result,
    result.changed ? `Simulated payment result recorded: ${result.payment.status}` : `Payment already ${result.payment.status}`,
  );
}

export async function list(req: Request, res: Response) {
  const result = await paymentService.listOrderPayments(req.user!, param(req, 'orderId'));
  sendSuccess(res, result, 'Payments fetched');
}
