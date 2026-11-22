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

/** Development-only; reached only through demoLoginGuard. */
export async function demoLogin(req: Request, res: Response) {
  const result = await authService.demoLogin(req.body);
  sendSuccess(res, result, 'Demo login successful');
}

export async function me(req: Request, res: Response) {
  const user = await authService.getCurrentUser(req.user!.id);
  sendSuccess(res, { user }, 'Current user fetched');
}

export async function changePassword(req: Request, res: Response) {
  const result = await authService.changePassword(req.user!.id, req.body);
  sendSuccess(res, result, 'Password changed. Other sessions have been signed out.');
}

export async function updateMe(req: Request, res: Response) {
  const user = await authService.updateCurrentUser(req.user!.id, req.body);
  sendSuccess(res, { user }, 'Profile updated');
}
