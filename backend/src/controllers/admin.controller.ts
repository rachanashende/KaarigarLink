import type { Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import { sendSuccess } from '../utils/apiResponse';
import type { AdminListQuery } from '../validators/admin.validator';

const q = (req: Request) => req.query as unknown as AdminListQuery;

export async function users(req: Request, res: Response) {
  sendSuccess(res, await adminService.listUsers(req.user!, q(req)), 'Users fetched');
}
export async function orders(req: Request, res: Response) {
  sendSuccess(res, await adminService.listOrders(req.user!, q(req)), 'Orders fetched');
}
export async function quotes(req: Request, res: Response) {
  sendSuccess(res, await adminService.listQuotes(req.user!, q(req)), 'Quotes fetched');
}
export async function invitations(req: Request, res: Response) {
  sendSuccess(res, await adminService.listInvitations(req.user!, q(req)), 'Invitations fetched');
}
export async function workshops(req: Request, res: Response) {
  sendSuccess(res, await adminService.listWorkshops(req.user!, q(req)), 'Workshops fetched');
}
