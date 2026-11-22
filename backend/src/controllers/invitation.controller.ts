import type { Request, Response } from 'express';
import * as invitationService from '../services/invitation.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';
import type { JobInvitationsQuery, WorkshopInvitationsQuery } from '../validators/invitation.validator';

export async function inviteWorkshop(req: Request, res: Response) {
  const result = await invitationService.inviteWorkshop(req.user!, param(req, 'id'), req.body.workshopId);
  if (result.created) sendSuccess(res, result, 'Workshop invited', 201);
  else sendSuccess(res, result, 'Workshop already invited');
}

export async function listJobInvitations(req: Request, res: Response) {
  const data = await invitationService.listJobInvitations(req.user!, param(req, 'id'), req.query as unknown as JobInvitationsQuery);
  sendSuccess(res, data, 'Invitations fetched');
}

export async function listMyInvitations(req: Request, res: Response) {
  const data = await invitationService.listMyInvitations(req.user!, req.query as unknown as WorkshopInvitationsQuery);
  sendSuccess(res, data, 'Invitations fetched');
}

export async function respondToInvitation(req: Request, res: Response) {
  const invitation = await invitationService.respondToInvitation(req.user!, param(req, 'id'), req.body);
  sendSuccess(res, { invitation }, invitation.status === 'ACCEPTED' ? 'Invitation accepted' : 'Invitation declined');
}
