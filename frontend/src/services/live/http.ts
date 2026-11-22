import { z, type ZodType } from 'zod';
import type { User } from '@/types';
import { ServiceError, type ServiceErrorCode } from '../contracts';

/**
 * Live-mode HTTP client. Every backend call goes through `api()`, which
 * centralises the base URL, the Bearer token, JSON serialisation, the
 * `{ success, message, data }` envelope, Zod validation of `data`, and the
 * mapping of HTTP errors to ServiceError (keeping the backend's message).
 */

const TOKEN_KEY = 'kaarigarlink.live-session.v1';

/** VITE_API_BASE_URL, e.g. http://localhost:4000/api (no trailing slash needed). */
export function apiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!raw || !raw.trim()) {
    throw new ServiceError('NOT_CONFIGURED', 'Live mode needs VITE_API_BASE_URL, for example http://localhost:4000/api. See frontend/.env.example.');
  }
  return raw.trim().replace(/\/+$/, '');
}

// ---------- Session (token + current user) ----------

let currentUser: User | null = null;
const expiryListeners = new Set<() => void>();

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export const session = {
  token(): string | null {
    try { return storage()?.getItem(TOKEN_KEY) ?? null; } catch { return null; }
  },
  start(token: string, user: User) {
    try { storage()?.setItem(TOKEN_KEY, token); }
    catch { throw new ServiceError('SERVER', 'Session storage is unavailable. Allow site storage, then retry.'); }
    currentUser = user;
  },
  setUser(user: User) { currentUser = user; },
  user(): User | null { return currentUser; },
  clear() {
    try { storage()?.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
    currentUser = null;
  },
  /** The backend rejected the token: forget it and tell the UI once. */
  expire() {
    const hadSession = currentUser !== null || session.token() !== null;
    session.clear();
    if (hadSession) for (const listener of expiryListeners) listener();
  },
  onExpired(listener: () => void) {
    expiryListeners.add(listener);
    return () => { expiryListeners.delete(listener); };
  },
};

/** The signed-in live user, or UNAUTHORIZED. */
export function requireUser(): User {
  const user = session.user();
  if (!user) throw new ServiceError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
  return user;
}

// ---------- Requests ----------

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** false for login/register (no token sent, a 401 is a credential error, not an expiry). */
  auth?: boolean;
}

const errorBody = z.object({
  message: z.string().optional(),
  errors: z.array(z.object({ field: z.string().optional(), message: z.string() })).optional(),
});

function codeFor(status: number): ServiceErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 400 || status === 422) return 'VALIDATION';
  return 'SERVER';
}

function messageFor(status: number, body: unknown): string {
  const parsed = errorBody.safeParse(body);
  const message = parsed.success ? parsed.data.message : undefined;
  const first = parsed.success ? parsed.data.errors?.[0] : undefined;
  if (first) return (first.field ? first.field + ': ' : '') + first.message;
  if (status === 403) return message ?? 'You do not have permission to do this.';
  if (status >= 500) return 'The server could not complete the request. Please retry.';
  return message ?? 'The server could not complete the request.';
}

export async function api<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) params.set(key, String(value));
  const search = params.toString();
  const url = apiBaseUrl() + path + (search ? '?' + search : '');
  const useAuth = options.auth !== false;
  const token = useAuth ? session.token() : null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ServiceError('NETWORK', 'Unable to reach the KaarigarLink server. Check that the backend is running and retry.');
  }

  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }

  if (!response.ok) {
    if (response.status === 401 && useAuth) {
      session.expire();
      throw new ServiceError('UNAUTHORIZED', 'Your session has expired. Sign in again.', 401);
    }
    throw new ServiceError(codeFor(response.status), messageFor(response.status, body), response.status);
  }
  const envelope = z.object({ success: z.literal(true), data: schema }).safeParse(body);
  if (!envelope.success) throw new ServiceError('SERVER', 'The server response did not match the expected format.');
  return envelope.data.data;
}

const pageSchema = z.object({ page: z.number(), totalPages: z.number() });

/** Reads every page of a `{ items, pagination }` list (limit 100, at most 50 pages). */
export async function apiAll<T>(path: string, item: ZodType<T>, query: Record<string, string | number | undefined> = {}): Promise<T[]> {
  const schema = z.object({ items: z.array(item), pagination: pageSchema });
  const all: T[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await api(path, schema, { query: { ...query, page, limit: 100 } });
    all.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }
  return all;
}

// ---------- M12: file transfer ----------

/** Uploads one file as the raw request body (Content-Type = its MIME type, X-File-Name = its name). */
export async function apiUpload<T>(path: string, file: File, schema: ZodType<T>): Promise<T> {
  const token = session.token();
  let response: Response;
  try {
    response = await fetch(apiBaseUrl() + path, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: file,
    });
  } catch {
    throw new ServiceError('NETWORK', 'The upload could not reach the server. Check your connection and retry.');
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    if (response.status === 401) { session.expire(); throw new ServiceError('UNAUTHORIZED', 'Your session has expired. Sign in again.', 401); }
    if (response.status === 413) throw new ServiceError('VALIDATION', 'The file is larger than the server allows.', 413);
    throw new ServiceError(codeFor(response.status), messageFor(response.status, body), response.status);
  }
  const envelope = z.object({ success: z.literal(true), data: schema }).safeParse(body);
  if (!envelope.success) throw new ServiceError('SERVER', 'The server response did not match the expected format.');
  return envelope.data.data;
}

/** Downloads a protected file with the session token and saves it through the browser. */
export async function apiDownload(path: string, fileName: string): Promise<void> {
  const token = session.token();
  let response: Response;
  try {
    response = await fetch(apiBaseUrl() + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  } catch {
    throw new ServiceError('NETWORK', 'The download could not reach the server. Check your connection and retry.');
  }
  if (!response.ok) {
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (response.status === 401) { session.expire(); throw new ServiceError('UNAUTHORIZED', 'Your session has expired. Sign in again.', 401); }
    if (response.status === 410) throw new ServiceError('NOT_FOUND', 'The file content is no longer available on the server.', 410);
    throw new ServiceError(codeFor(response.status), messageFor(response.status, body), response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.rel = 'noopener';
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
