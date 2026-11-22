import { expect, test } from '@playwright/test';
import { API, call, signIn, token } from './support';

test('each role signs in through the form and lands in its own workspace; a wrong password is rejected', async ({ page }) => {
  for (const [account, prefix] of [['buyer', '/buyer/'], ['workshop', '/workshop/'], ['inspector', '/inspector/'], ['admin', '/admin/']] as const) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.evaluate(() => sessionStorage.clear());
    await signIn(page, account);
    await expect(page).toHaveURL(new RegExp(prefix));
    // Refresh restores the session from the stored token (/auth/me).
    await page.reload();
    await expect(page).toHaveURL(new RegExp(prefix));
    await page.evaluate(() => sessionStorage.clear());
  }
  await page.goto('/login');
  await page.getByLabel('Email address').fill('asha.rao@kaarigarlink.test');
  await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').or(page.getByRole('status')).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('the backend rejects direct calls without a token or with the wrong role', async ({ request }) => {
  for (const path of ['/auth/me', '/jobs/mine', '/orders/mine', '/notifications', '/audit', '/admin/users', '/inspections/assigned']) {
    expect((await call(request, 'get', path)).status(), path).toBe(401);
  }
  expect((await request.get(API + '/auth/me', { headers: { Authorization: 'Bearer not-a-token' } })).status()).toBe(401);

  const buyer = await token(request, 'buyer');
  const workshop = await token(request, 'workshop');
  const inspector = await token(request, 'inspector');
  for (const [bearer, path] of [[buyer, '/audit'], [buyer, '/admin/users'], [workshop, '/admin/orders'], [inspector, '/admin/workshops'], [buyer, '/inspections/assigned']] as const) {
    expect((await call(request, 'get', path, bearer)).status(), path).toBe(403);
  }
  // A workshop cannot create jobs; an inspector cannot submit quotes.
  expect((await call(request, 'post', '/jobs', workshop, { title: 'x' })).status()).toBe(403);
  expect((await call(request, 'put', '/workshops/seed-ws-precision-works', buyer, { name: 'Hijack' })).status()).toBeGreaterThanOrEqual(400);
});

test('each demo shortcut signs in with one click through the backend and opens the right workspace', async ({ page }) => {
  // Needs the backend started with NODE_ENV=development and ENABLE_DEMO_LOGIN=true.
  for (const [label, email, prefix, role] of [
    ['Demo Buyer', 'asha.rao@kaarigarlink.test', '/buyer/', 'BUYER'],
    ['Demo Workshop', 'precision-works@kaarigarlink.test', '/workshop/', 'WORKSHOP'],
    ['Demo Inspector', 'priya.inspector@kaarigarlink.test', '/inspector/', 'INSPECTOR'],
    ['Demo Admin', 'admin@kaarigarlink.test', '/admin/', 'ADMIN'],
  ] as const) {
    await page.goto('/login');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/login');
    const reply = page.waitForResponse(res => res.url().endsWith('/api/auth/demo-login'));
    await page.getByRole('region', { name: 'Demo accounts' }).getByRole('button', { name: label, exact: true }).click();
    const res = await reply;
    expect(res.status()).toBe(200);
    expect(res.request().postDataJSON()).toEqual({ role });
    const body = await res.json();
    expect(body.data.user).toMatchObject({ email, role });
    await expect(page).toHaveURL(new RegExp(prefix));
    // A normal session: it survives a reload (restored through /auth/me with the stored token).
    await page.reload();
    await expect(page).toHaveURL(new RegExp(prefix));
    await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  }
});
