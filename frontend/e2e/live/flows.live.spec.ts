import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ACCOUNTS, API, RUN, call, signIn, token } from './support';

/**
 * Live-mode flows outside the main journey: publishing a draft, cancelling a job,
 * withdrawing a quote, the quote version conflict, cancellation with a refund and
 * a password change. Setup goes through the API; the action under test through the UI.
 */
const WORKSHOP_ID = 'seed-ws-precision-works';
let seq = 0;

async function fresh(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => sessionStorage.clear());
}

async function createJob(request: APIRequestContext, buyer: string, status: 'DRAFT' | 'OPEN' = 'OPEN') {
  seq += 1;
  const title = `E2E flow ${RUN}-${seq}`;
  const res = await call(request, 'post', '/jobs', buyer, {
    title, description: 'Live flow verification job.', material: 'aluminium', manufacturingProcess: 'CNC_MACHINING',
    quantity: 10, deadline: new Date(Date.now() + 20 * 86_400_000).toISOString(), status,
  });
  expect(res.status(), await res.text()).toBe(201);
  return { id: (await res.json()).data.job.id as string, title };
}

/** Job -> invitation -> accepted -> quote. Returns ids. */
async function quotedJob(request: APIRequestContext) {
  const buyer = await token(request, 'buyer');
  const workshop = await token(request, 'workshop');
  const job = await createJob(request, buyer);
  const inv = await call(request, 'post', `/jobs/${job.id}/invitations`, buyer, { workshopId: WORKSHOP_ID });
  expect(inv.status(), await inv.text()).toBe(201);
  const invitationId = (await inv.json()).data.invitation.id as string;
  expect((await call(request, 'post', `/invitations/${invitationId}/respond`, workshop, { response: 'ACCEPTED' })).status()).toBe(200);
  const quote = await call(request, 'post', `/quotes/invitations/${invitationId}`, workshop, { totalPrice: '50000.00', estimatedDays: 10 });
  expect(quote.status(), await quote.text()).toBe(201);
  return { job, invitationId, quote: (await quote.json()).data.quote as { id: string; updatedAt: string }, buyer, workshop };
}

test('buyer publishes a draft job, then cancels an open job', async ({ page, request }) => {
  const buyer = await token(request, 'buyer');
  const draft = await createJob(request, buyer, 'DRAFT');
  await fresh(page);
  await signIn(page, 'buyer');
  await page.goto('/buyer/jobs/' + draft.id);
  const status = page.getByRole('region', { name: 'Job status' });
  await status.getByRole('button', { name: 'Publish job' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish job' }).click();
  await expect(status.getByText('Job published.')).toBeVisible();
  expect((await (await call(request, 'get', '/jobs/' + draft.id, buyer)).json()).data.job.status).toBe('OPEN');

  await status.getByRole('button', { name: 'Cancel job' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel job' }).click();
  await expect(status.getByText('Job cancelled.')).toBeVisible();
  expect((await (await call(request, 'get', '/jobs/' + draft.id, buyer)).json()).data.job.status).toBe('CANCELLED');
  // Another buyer cannot change this job.
  expect((await call(request, 'put', '/jobs/' + draft.id, await token(request, 'otherBuyer'), { status: 'OPEN' })).status()).toBe(404);
});

test('a stale quote edit is rejected with 409; the workshop withdraws the quote in the UI', async ({ page, request }) => {
  const { job, invitationId, quote, workshop } = await quotedJob(request);
  const first = await call(request, 'patch', '/quotes/' + quote.id, workshop, { totalPrice: '49000.00', expectedUpdatedAt: quote.updatedAt });
  expect(first.status(), await first.text()).toBe(200);
  const stale = await call(request, 'patch', '/quotes/' + quote.id, workshop, { totalPrice: '48000.00', expectedUpdatedAt: quote.updatedAt });
  expect(stale.status()).toBe(409);

  await fresh(page);
  await signIn(page, 'workshop');
  await page.goto('/workshop/invitations/' + invitationId);
  await expect(page.getByText(job.title).first()).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw quote' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Withdraw quotation', exact: true }).click();
  await expect(page.getByText('Quotation withdrawn.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', { name: 'Workshop quotation history' })).toContainText('WITHDRAWN');
});

test('buyer cancels a paid order; the workshop records the refund; the buyer sees it', async ({ page, request }) => {
  const { quote, buyer } = await quotedJob(request);
  const award = await call(request, 'post', '/orders/award/' + quote.id, buyer);
  expect(award.status(), await award.text()).toBe(201);
  const orderId = (await award.json()).data.order.id as string;
  const payment = await call(request, 'post', `/orders/${orderId}/payments`, buyer, { amount: '20000.00', description: 'Advance' });
  expect(payment.status(), await payment.text()).toBe(201);
  const paymentId = (await payment.json()).data.payment.id as string;
  expect((await call(request, 'post', `/payments/${paymentId}/simulate`, buyer, { outcome: 'SUCCEEDED' })).status()).toBe(200);
  // A buyer may not refund their own payment (backend rule: workshop or admin).
  expect((await call(request, 'post', `/payments/${paymentId}/refund`, buyer, {})).status()).toBe(403);

  await fresh(page);
  await signIn(page, 'buyer');
  await page.goto('/buyer/orders/' + orderId);
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await page.getByLabel('Cancellation reason').fill('Design changed after award.');
  // Inline confirmation: the second "Cancel order" button confirms; "Keep order" backs out.
  await expect(page.getByRole('button', { name: 'Keep order' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order' }).last().click();
  await expect(page.getByText('Order cancelled.')).toBeVisible();
  const payments = page.getByRole('region', { name: 'Payments' });
  await expect(payments.getByRole('definition').filter({ hasText: '20,000.00' }).first()).toBeVisible();

  await fresh(page);
  await signIn(page, 'workshop');
  await page.goto('/workshop/orders/' + orderId);
  await page.getByRole('button', { name: 'Record refund' }).click();
  await expect(page.getByText('Refund recorded.')).toBeVisible();

  await fresh(page);
  await signIn(page, 'buyer');
  await page.goto('/buyer/orders/' + orderId);
  await expect(page.getByText(/REFUNDED|Refunded/).first()).toBeVisible();
});

test('a user changes the password in the UI; the old password and old tokens stop working', async ({ page, request }) => {
  const email = `e2e.buyer.${RUN}@example.test`;
  const original = 'E2e-Original-1';
  const changed = 'E2e-Changed-22';
  const reg = await call(request, 'post', '/auth/register', undefined, { name: 'Password Buyer', email, password: original, role: 'BUYER' });
  expect(reg.status(), await reg.text()).toBe(201);
  const oldToken = (await reg.json()).data.token as string;

  await fresh(page);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(original);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/buyer\//);
  await page.goto('/buyer/profile');
  // Tokens carry whole seconds: make sure the change is in a later second than the old token.
  await page.waitForTimeout(1100);
  await page.getByLabel('Current password').fill(original);
  await page.getByLabel('New password', { exact: true }).fill(changed);
  await page.getByLabel('Confirm new password').fill(changed);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  // This session continues with its new token.
  await page.reload();
  await expect(page).toHaveURL(/\/buyer\/profile/);

  expect((await request.get(API + '/auth/me', { headers: { Authorization: 'Bearer ' + oldToken } })).status()).toBe(401);
  expect((await call(request, 'post', '/auth/login', undefined, { email, password: original })).status()).toBe(401);
  expect((await call(request, 'post', '/auth/login', undefined, { email, password: changed })).status()).toBe(200);
  expect(ACCOUNTS.buyer).not.toBe(email);
});

test('workshop edits its profile, machinery, capabilities and capacity', async ({ page }) => {
  await fresh(page);
  await signIn(page, 'profileWorkshop');
  await page.goto('/workshop/profile');
  await expect(page.getByRole('heading', { name: 'Edit workshop profile' })).toBeVisible();

  const profile = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save profile' }) });
  await profile.getByLabel('Description').fill('Precision tooling and fixtures. Updated ' + RUN + '.');
  await profile.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();

  const machineName = 'E2E mill ' + RUN;
  await page.getByLabel('Machine name').fill(machineName);
  await page.getByRole('button', { name: 'Add machine' }).click();
  await expect(page.getByText('Machine added.')).toBeVisible();
  const machineRow = page.getByRole('row').filter({ hasText: machineName });
  await machineRow.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Machine removed.')).toBeVisible();
  await expect(machineRow).toHaveCount(0);

  // A capability for a process this workshop does not offer yet, then removed again.
  const process = page.getByLabel('Process');
  const offered = (await page.getByRole('table', { name: 'Workshop capabilities' }).getByRole('row').allInnerTexts()).map(text => text.toLowerCase());
  const values = await process.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value).filter(Boolean));
  const free = values.filter(value => !offered.some(row => row.startsWith(value.replaceAll('_', ' ').toLowerCase())));
  expect(free.length).toBeGreaterThan(0);
  await process.selectOption(free[0]!);
  await page.getByLabel('Supported materials').fill('aluminium, mild steel');
  await page.getByRole('button', { name: 'Add capability' }).click();
  await expect(page.getByText('Capability added.')).toBeVisible();
  const processLabel = free[0]!.replaceAll('_', ' ').toLowerCase();
  const capabilityRow = page.getByRole('table', { name: 'Workshop capabilities' }).getByRole('row').filter({ hasText: new RegExp('^' + processLabel, 'i') });
  await capabilityRow.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Capability removed.')).toBeVisible();

  // Seeded windows cover the next few weeks; overlapping windows are rejected (shown as an alert).
  const units = String(300 + (Date.now() % 600));
  await page.getByLabel('Available capacity').fill(units);
  await page.getByLabel('Start date').fill(new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10));
  await page.getByLabel('End date').fill(new Date(Date.now() + 126 * 86_400_000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Add capacity window' }).click();
  await expect(page.getByText('Capacity window added.')).toBeVisible();
  const windowRow = page.getByRole('row').filter({ hasText: units });
  await windowRow.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Capacity window removed.')).toBeVisible();
});
