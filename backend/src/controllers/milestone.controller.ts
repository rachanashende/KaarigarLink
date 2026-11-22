import type { Request, Response } from 'express';
import * as milestoneService from '../services/milestone.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';

export async function create(req: Request, res: Response) {
  const milestone = await milestoneService.createMilestone(req.user!, param(req, 'orderId'), req.body);
  sendSuccess(res, { milestone }, 'Milestone created', 201);
}

export async function list(req: Request, res: Response) {
  const milestones = await milestoneService.listMilestones(req.user!, param(req, 'orderId'));
  sendSuccess(res, { milestones }, 'Milestones fetched');
}

export async function update(req: Request, res: Response) {
  const milestone = await milestoneService.updateMilestone(req.user!, param(req, 'milestoneId'), req.body);
  sendSuccess(res, { milestone }, 'Milestone updated');
}

type Transition = { changed: boolean; milestone: unknown };
const send = (res: Response, result: Transition, done: string, already: string) =>
  sendSuccess(res, result, result.changed ? done : already);

export async function start(req: Request, res: Response) {
  send(res, await milestoneService.startMilestone(req.user!, param(req, 'milestoneId')), 'Milestone started', 'Milestone already started');
}

export async function complete(req: Request, res: Response) {
  send(res, await milestoneService.completeMilestone(req.user!, param(req, 'milestoneId')), 'Milestone completed', 'Milestone already completed');
}

export async function approve(req: Request, res: Response) {
  send(res, await milestoneService.approveMilestone(req.user!, param(req, 'milestoneId')), 'Milestone approved', 'Milestone already approved');
}
