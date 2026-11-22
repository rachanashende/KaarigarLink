import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * M13: PostgreSQL text cannot hold NUL (U+0000), so a NUL anywhere in an ID or a body
 * string used to surface as a 500 from the database driver. Reject it up front as a
 * clean 400 before any query runs.
 */
function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (depth > 20 || value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => key.includes('\u0000') || containsNul(item, depth + 1));
}

function decodedPathHasNul(path: string): boolean {
  if (path.includes('\u0000')) return true;
  try {
    return decodeURIComponent(path).includes('\u0000');
  } catch {
    return false; // malformed escapes are left to the router (404)
  }
}

export const rejectNulBytes: RequestHandler = (req, _res, next) => {
  if (decodedPathHasNul(req.path) || containsNul(req.query) || containsNul(req.body)) {
    throw ApiError.badRequest('Request contains an invalid character');
  }
  next();
};
