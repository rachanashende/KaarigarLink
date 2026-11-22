import type { Request, Response } from 'express';
import * as inspectionService from '../services/inspection.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';

export async function create(req: Request, res: Response) {
  const result = await inspectionService.createInspection(req.user!, param(req, 'orderId'), req.body);
  sendSuccess(res, result, 'Inspection recorded', 201);
}

export async function list(req: Request, res: Response) {
  const inspections = await inspectionService.listOrderInspections(req.user!, param(req, 'orderId'));
  sendSuccess(res, { inspections }, 'Inspections fetched');
}
