import type { Request, Response } from 'express';
import * as jobService from '../services/job.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';
import type { ListJobsQuery } from '../validators/job.validator';

export async function createJob(req: Request, res: Response) {
  const job = await jobService.createJob(req.user!, req.body);
  sendSuccess(res, { job }, 'Job created', 201);
}

export async function listJobs(req: Request, res: Response) {
  const result = await jobService.listJobs(req.user!, req.query as unknown as ListJobsQuery);
  sendSuccess(res, result, 'Jobs fetched');
}

export async function getJob(req: Request, res: Response) {
  const job = await jobService.getJobById(req.user!, param(req, 'id'));
  sendSuccess(res, { job }, 'Job fetched');
}

export async function updateJob(req: Request, res: Response) {
  const job = await jobService.updateJob(req.user!, param(req, 'id'), req.body);
  sendSuccess(res, { job }, 'Job updated');
}
