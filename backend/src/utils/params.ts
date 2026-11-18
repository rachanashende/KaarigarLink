import type { Request } from 'express';

/**
 * Reads a route param as a string. Express 5 types params as
 * `string | string[]` (for wildcards); our routes only use named params,
 * which `validate({ params })` has already checked.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value.join('/') : String(value);
}
