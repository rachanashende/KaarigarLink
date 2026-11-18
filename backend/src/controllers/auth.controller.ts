import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { sendSuccess } from '../utils/apiResponse';

export async function register(req: Request, res: Response) {
  const result = await authService.register(req.body);
  sendSuccess(res, result, 'Registration successful', 201);
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body);
  sendSuccess(res, result, 'Login successful');
}

export async function me(req: Request, res: Response) {
  const user = await authService.getCurrentUser(req.user!.id);
  sendSuccess(res, { user }, 'Current user fetched');
}
