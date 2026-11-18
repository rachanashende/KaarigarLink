import type { Request, Response } from 'express';
import * as workshopService from '../services/workshop.service';
import * as machineService from '../services/machine.service';
import * as capabilityService from '../services/capability.service';
import * as capacityService from '../services/capacity.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';
import type { ListWorkshopsQuery } from '../validators/workshop.validator';

// ---------- Profile ----------
export async function createWorkshop(req: Request, res: Response) {
  const workshop = await workshopService.createWorkshop(req.user!, req.body);
  sendSuccess(res, { workshop }, 'Workshop profile created', 201);
}

export async function getMyWorkshop(req: Request, res: Response) {
  const workshop = await workshopService.getMyWorkshop(req.user!);
  sendSuccess(res, { workshop }, 'Workshop profile fetched');
}

export async function listWorkshops(req: Request, res: Response) {
  const result = await workshopService.listWorkshops(req.query as unknown as ListWorkshopsQuery);
  sendSuccess(res, result, 'Workshops fetched');
}

export async function getWorkshop(req: Request, res: Response) {
  const workshop = await workshopService.getWorkshopById(param(req, 'id'));
  sendSuccess(res, { workshop }, 'Workshop fetched');
}

export async function updateWorkshop(req: Request, res: Response) {
  const workshop = await workshopService.updateWorkshop(req.user!, param(req, 'id'), req.body);
  sendSuccess(res, { workshop }, 'Workshop updated');
}

// ---------- Machines ----------
export async function listMachines(req: Request, res: Response) {
  const machines = await machineService.listMachines(param(req, 'id'));
  sendSuccess(res, { machines }, 'Machines fetched');
}

export async function createMachine(req: Request, res: Response) {
  const machine = await machineService.createMachine(req.user!, param(req, 'id'), req.body);
  sendSuccess(res, { machine }, 'Machine registered', 201);
}

export async function updateMachine(req: Request, res: Response) {
  const machine = await machineService.updateMachine(req.user!, param(req, 'id'), param(req, 'machineId'), req.body);
  sendSuccess(res, { machine }, 'Machine updated');
}

export async function deleteMachine(req: Request, res: Response) {
  await machineService.deleteMachine(req.user!, param(req, 'id'), param(req, 'machineId'));
  sendSuccess(res, null, 'Machine removed');
}

// ---------- Capabilities ----------
export async function listCapabilities(req: Request, res: Response) {
  const capabilities = await capabilityService.listCapabilities(param(req, 'id'));
  sendSuccess(res, { capabilities }, 'Capabilities fetched');
}

export async function createCapability(req: Request, res: Response) {
  const capability = await capabilityService.createCapability(req.user!, param(req, 'id'), req.body);
  sendSuccess(res, { capability }, 'Capability added', 201);
}

export async function updateCapability(req: Request, res: Response) {
  const capability = await capabilityService.updateCapability(
    req.user!,
    param(req, 'id'),
    param(req, 'capabilityId'),
    req.body,
  );
  sendSuccess(res, { capability }, 'Capability updated');
}

export async function deleteCapability(req: Request, res: Response) {
  await capabilityService.deleteCapability(req.user!, param(req, 'id'), param(req, 'capabilityId'));
  sendSuccess(res, null, 'Capability removed');
}

// ---------- Capacity ----------
export async function listCapacity(req: Request, res: Response) {
  const capacity = await capacityService.listCapacity(param(req, 'id'));
  sendSuccess(res, { capacity }, 'Capacity fetched');
}

export async function createCapacity(req: Request, res: Response) {
  const capacity = await capacityService.createCapacity(req.user!, param(req, 'id'), req.body);
  sendSuccess(res, { capacity }, 'Capacity window added', 201);
}

export async function updateCapacity(req: Request, res: Response) {
  const capacity = await capacityService.updateCapacity(req.user!, param(req, 'id'), param(req, 'capacityId'), req.body);
  sendSuccess(res, { capacity }, 'Capacity updated');
}

export async function deleteCapacity(req: Request, res: Response) {
  await capacityService.deleteCapacity(req.user!, param(req, 'id'), param(req, 'capacityId'));
  sendSuccess(res, null, 'Capacity window removed');
}
