import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

/**
 * Role guard. Use after `authenticate`:
 *   router.post('/jobs', authenticate, authorize('BUYER'), handler)
 */
export const authorize =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!allowed.includes(req.user.role)) {
      throw ApiError.forbidden(`This action requires role: ${allowed.join(' or ')}`);
    }
    next();
  };
