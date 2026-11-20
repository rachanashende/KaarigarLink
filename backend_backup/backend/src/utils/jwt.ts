import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { ApiError } from './ApiError';

export interface TokenPayload {
  sub: string; // user id
  email: string;
  role: Role;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new Error('Malformed token payload');
    }
    return decoded as unknown as TokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw ApiError.unauthorized('Token expired');
    throw ApiError.unauthorized('Invalid authentication token');
  }
}
