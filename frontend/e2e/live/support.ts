import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Shared helpers for the live-mode journeys (see playwright.live.config.ts). */
export const API = (process.env.E2E_API_URL ?? 'http://127.0.0.1:4100/api').replace(/\/+$/, '');

export function password(): string {
  const value = process.env.E2E_PASSWORD;
  if (!value) throw new Error('Set E2E_PASSWORD to the SEED_DEFAULT_PASSWORD of the disposable e2e database.');
  return value;
}

/** Seed accounts (backend/prisma/seed/data.ts). */
export const ACCOUNTS = {
  buyer: 'asha.rao@kaarigarlink.test',
  otherBuyer: 'vikram.mehta@kaarigarlink.test',
  workshop: 'precision-works@kaarigarlink.test',
  /** Used for profile edits so the main journey's workshop stays unchanged. */
  profileWorkshop: 'talegaon-tooling@kaarigarlink.test',
  inspector: 'priya.inspector@kaarigarlink.test',
  admin: 'admin@kaarigarlink.test',
} as const;
export type Account = keyof typeof ACCOUNTS;

export const RUN = Date.now().toString(36);

/** Signs in through the real login form and waits for the role workspace. */
export async function signIn(page: Page, account: Account, pass = password()) {
  await signInWith(page, ACCOUNTS[account], pass);
}

/** Signs in any account (e.g. one registered by the test) through the login form. */
export async function signInWith(page: Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function signOut(page: Page) {
  await page.evaluate(() => sessionStorage.clear());
}

/** A backend token for direct API calls (setup and authorisation checks). */
export async function token(request: APIRequestContext, account: Account, pass = password()): Promise<string> {
  const res = await request.post(API + '/auth/login', { data: { email: ACCOUNTS[account], password: pass } });
  expect(res.status(), 'login ' + account).toBe(200);
  return (await res.json()).data.token as string;
}

export async function call(request: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, bearer?: string, data?: unknown) {
  return request[method](API + path, {
    headers: bearer ? { Authorization: 'Bearer ' + bearer } : {},
    ...(data === undefined ? {} : { data: data as object }),
  });
}

export const PDF = Buffer.from('%PDF-1.4\n% KaarigarLink e2e drawing\n');
