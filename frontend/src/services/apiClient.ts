import type { ZodType } from 'zod';
import { ServiceError } from './contracts';

export async function apiRequest<T>(url: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ServiceError('NETWORK', 'Unable to reach the server. Check your connection and retry.');
  }
  if (!response.ok) {
    const code = response.status === 401 ? 'UNAUTHORIZED'
      : response.status === 403 ? 'FORBIDDEN'
      : response.status === 404 ? 'NOT_FOUND'
      : response.status === 409 ? 'CONFLICT'
      : response.status === 400 || response.status === 422 ? 'VALIDATION' : 'SERVER';
    throw new ServiceError(code, 'The server could not complete the request.', response.status);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ServiceError('VALIDATION', 'The server returned invalid JSON.'); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ServiceError('VALIDATION', 'The server response does not match the agreed contract.');
  return parsed.data;
}
