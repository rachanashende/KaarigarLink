import type { Request, RequestHandler } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * Development-only demo login (POST /api/auth/demo-login). Two server-side gates run
 * before the request body is even read:
 *
 *   1. Availability: NODE_ENV must be "development" AND ENABLE_DEMO_LOGIN=true. Anything
 *      else (including production, where the flag is rejected at startup) answers 404.
 *   2. Local only: the TCP peer must be a loopback address (the socket's own address, not
 *      req.ip, which `trust proxy` would take from X-Forwarded-For), the Host header must
 *      name this machine (guards against DNS rebinding), and an Origin, when sent, must be
 *      a localhost origin. Otherwise 403.
 */
interface DemoConfig {
  NODE_ENV: string;
  demoLoginEnabled: boolean;
}

export function demoLoginAvailable(config: DemoConfig = env): boolean {
  return config.NODE_ENV === 'development' && config.demoLoginEnabled;
}

const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(value: string): string | null {
  try {
    return new URL('http://' + value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLocalRequest(req: Pick<Request, 'socket' | 'headers'>): boolean {
  if (!LOOPBACK_PEERS.has(req.socket.remoteAddress ?? '')) return false;
  const host = req.headers.host;
  if (!host || !LOCAL_HOSTNAMES.has(hostnameOf(host) ?? '')) return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || !LOCAL_HOSTNAMES.has(url.hostname.toLowerCase())) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export const demoLoginGuard: RequestHandler = (req, _res, next) => {
  if (!demoLoginAvailable()) throw ApiError.notFound('Demo login is disabled on this server');
  if (!isLocalRequest(req)) throw ApiError.forbidden('Demo login is only available from this computer');
  next();
};
