import type { Request, Response } from 'express';
import * as inspectionService from '../services/inspection.service';
import * as assignmentService from '../services/inspectorAssignment.service';
import type { AssignedOrdersQuery, ListInspectionsQuery } from '../validators/inspection.validator';
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

// ---------- B1: assignment and platform-wide views ----------

export async function assign(req: Request, res: Response) {
  const result = await assignmentService.assignInspector(req.user!, param(req, 'orderId'), req.body.inspectorId);
  if (!result.changed) sendSuccess(res, result, 'Inspector already assigned to this order');
  else sendSuccess(res, result, result.previous ? 'Inspector reassigned' : 'Inspector assigned', 201);
}

export async function unassign(req: Request, res: Response) {
  const result = await assignmentService.unassignInspector(req.user!, param(req, 'orderId'));
  sendSuccess(res, result, result.changed ? 'Inspector unassigned' : 'No inspector was assigned');
}

export async function assignments(req: Request, res: Response) {
  const assignments = await assignmentService.listOrderAssignments(req.user!, param(req, 'orderId'));
  sendSuccess(res, { assignments }, 'Inspector assignments fetched');
}

export async function assignedToMe(req: Request, res: Response) {
  const result = await assignmentService.listMyAssignedOrders(req.user!, req.query as unknown as AssignedOrdersQuery);
  sendSuccess(res, result, 'Assigned orders fetched');
}

export async function inspectors(req: Request, res: Response) {
  const inspectors = await assignmentService.listInspectors(req.user!);
  sendSuccess(res, { inspectors }, 'Inspectors fetched');
}

export async function listAll(req: Request, res: Response) {
  const result = await inspectionService.listAllInspections(req.user!, req.query as unknown as ListInspectionsQuery);
  sendSuccess(res, result, 'Inspections fetched');
}

// ---------- M11: private inspection drafts ----------
export async function getDraft(req: Request, res: Response) {
  const draft = await inspectionService.getDraft(req.user!, param(req, 'orderId'));
  sendSuccess(res, { draft }, draft ? 'Draft fetched' : 'No draft saved');
}

export async function saveDraft(req: Request, res: Response) {
  const draft = await inspectionService.saveDraft(req.user!, param(req, 'orderId'), req.body);
  sendSuccess(res, { draft }, 'Draft saved');
}

export async function deleteDraft(req: Request, res: Response) {
  const result = await inspectionService.deleteDraft(req.user!, param(req, 'orderId'));
  sendSuccess(res, result, result.deleted ? 'Draft deleted' : 'No draft to delete');
}
