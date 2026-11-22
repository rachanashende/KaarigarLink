import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, RUN, call, signIn, signInWith, token } from './support';

/**
 * Admin and notifications in live mode (M13). Admins are never notification
 * recipients: their actions notify the affected users (the assigned or replaced
 * inspector, the workshop owner) and they follow platform activity in the audit
 * history. These tests check the admin's bell, that admin actions notify exactly the
 * right users, the recipient's bell (unread count, list, mark read), and that nobody
 * can read or change another user's notifications.
 */
test.describe.configure({ mode: 'serial' });

interface Notification { id: string; type: string; title: string; entityId: string | null; readAt: string | null }
const INSPECTOR_PASSWORD = 'E2e-Inspector-1';
const state = {
  orderId: '',
  first: { id: '', email: `e2e.notify.a.${RUN}@example.test`, name: 'Notify Inspector A ' + RUN, token: '' },
  second: { id: '', email: `e2e.notify.b.${RUN}@example.test`, name: 'Notify Inspector B ' + RUN, token: '' },
  adminUnread: 0,
};

async function fresh(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => sessionStorage.clear());
}
async function notifications(request: APIRequestContext, bearer: string): Promise<Notification[]> {
  const res = await call(request, 'get', '/notifications?limit=100', bearer);
  expect(res.status()).toBe(200);
  return (await res.json()).data.items as Notification[];
}
async function unread(request: APIRequestContext, bearer: string): Promise<number> {
  const res = await call(request, 'get', '/notifications/unread-count', bearer);
  expect(res.status()).toBe(200);
  return (await res.json()).data.unread as number;
}
const bell = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Notifications/ });

test.beforeAll(async ({ request }) => {
  // Two fresh inspectors (empty notification lists) and an awarded order with none assigned.
  for (const person of [state.first, state.second]) {
    const reg = await call(request, 'post', '/auth/register', undefined, { name: person.name, email: person.email, password: INSPECTOR_PASSWORD, role: 'INSPECTOR' });
    expect(reg.status(), await reg.text()).toBe(201);
    const body = (await reg.json()).data;
    person.id = body.user.id;
    person.token = body.token;
  }
  const buyer = await token(request, 'buyer');
  const workshop = await token(request, 'workshop');
  const job = await call(request, 'post', '/jobs', buyer, {
    title: 'E2E notify ' + RUN, description: 'Admin notification verification.', material: 'aluminium',
    manufacturingProcess: 'CNC_MACHINING', quantity: 10, deadline: new Date(Date.now() + 20 * 86_400_000).toISOString(),
  });
  expect(job.status(), await job.text()).toBe(201);
  const jobId = (await job.json()).data.job.id as string;
  const inv = await call(request, 'post', `/jobs/${jobId}/invitations`, buyer, { workshopId: 'seed-ws-precision-works' });
  const invitationId = (await inv.json()).data.invitation.id as string;
  expect((await call(request, 'post', `/invitations/${invitationId}/respond`, workshop, { response: 'ACCEPTED' })).status()).toBe(200);
  const quote = await call(request, 'post', `/quotes/invitations/${invitationId}`, workshop, { totalPrice: '40000.00', estimatedDays: 10 });
  const award = await call(request, 'post', '/orders/award/' + (await quote.json()).data.quote.id, buyer);
  expect(award.status(), await award.text()).toBe(201);
  state.orderId = (await award.json()).data.order.id;
});

test('admin: the bell shows the admin\'s own notifications only, with a matching unread count', async ({ page, request }) => {
  const admin = await token(request, 'admin');
  const mine = await notifications(request, admin);
  state.adminUnread = await unread(request, admin);
  expect(state.adminUnread).toBe(mine.filter(item => !item.readAt).length);

  await fresh(page);
  await signIn(page, 'admin');
  await expect(bell(page)).toHaveAccessibleName(state.adminUnread ? `Notifications, ${state.adminUnread} unread` : 'Notifications');
  await bell(page).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel).toBeVisible();
  if (mine.length === 0) {
    await expect(panel.getByText('No notifications yet.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  } else {
    await expect(panel.getByRole('listitem')).toHaveCount(Math.min(mine.length, 20));
  }
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('admin: assigning, reassigning and verifying notify exactly the affected users, never the admin', async ({ page, request }) => {
  const admin = await token(request, 'admin');
  const buyer = await token(request, 'buyer');
  const workshop = await token(request, 'workshop');
  const buyerBefore = (await notifications(request, buyer)).length;
  const workshopBefore = (await notifications(request, workshop)).length;

  await fresh(page);
  await signIn(page, 'admin');
  await page.goto('/admin/orders/' + state.orderId);
  const assignment = page.getByRole('region', { name: 'Inspector assignment' });
  await assignment.getByLabel('Assign inspector').selectOption(state.first.id);
  await assignment.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(assignment.getByText('Inspector assigned.')).toBeVisible();

  const a1 = await notifications(request, state.first.token);
  expect(a1.map(item => item.title)).toEqual(['New inspection assignment']);
  expect(await unread(request, state.first.token)).toBe(1);
  expect(await notifications(request, state.second.token)).toHaveLength(0);

  await assignment.getByLabel('Reassign to').selectOption(state.second.id);
  await assignment.getByRole('button', { name: 'Reassign', exact: true }).click();
  await expect(assignment.getByText('Inspector reassigned.')).toBeVisible();
  expect((await notifications(request, state.first.token)).map(item => item.title).sort()).toEqual(['Inspection assignment ended', 'New inspection assignment']);
  expect((await notifications(request, state.second.token)).map(item => item.title)).toEqual(['New inspection assignment']);

  // Workshop verification notifies the workshop's owner.
  const owner = await (async () => {
    const res = await call(request, 'post', '/auth/login', undefined, { email: 'nashik-small-batch@kaarigarlink.test', password: process.env.E2E_PASSWORD });
    expect(res.status()).toBe(200);
    return (await res.json()).data.token as string;
  })();
  const ownerBefore = (await notifications(request, owner)).length;
  await page.goto('/admin/workshops/seed-ws-nashik-small-batch');
  const verify = page.getByRole('button', { name: 'Verify workshop' });
  const pending = page.getByRole('button', { name: 'Return to pending' });
  await expect(verify.or(pending).first()).toBeVisible();
  if (await verify.isDisabled()) { await pending.click(); await expect(verify).toBeEnabled(); }
  await verify.click();
  await expect(verify).toBeDisabled();
  const ownerAfter = await notifications(request, owner);
  expect(ownerAfter.length).toBeGreaterThan(ownerBefore);
  expect(ownerAfter[0]!.title).toBe('Verification verified');

  // Assignment and verification do not notify the order's buyer or workshop, nor the admin.
  expect((await notifications(request, buyer)).length).toBe(buyerBefore);
  expect((await notifications(request, workshop)).length).toBe(workshopBefore);
  expect(await unread(request, admin)).toBe(state.adminUnread);
});

test('a recipient reads notifications in the bell: unread count, list, open one, mark all read', async ({ page, request }) => {
  await fresh(page);
  await signInWith(page, state.first.email, INSPECTOR_PASSWORD);
  await expect(bell(page)).toHaveAccessibleName('Notifications, 2 unread');
  await bell(page).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByRole('listitem')).toHaveCount(2);
  await expect(panel.getByLabel('Unread')).toHaveCount(2);

  // Opening a notification marks it read and follows its link.
  await panel.getByRole('button', { name: /New inspection assignment/ }).click();
  await expect(page).toHaveURL(/\/inspector\/inspections/);
  await expect(bell(page)).toHaveAccessibleName('Notifications, 1 unread');
  expect(await unread(request, state.first.token)).toBe(1);

  await bell(page).click();
  await panel.getByRole('button', { name: 'Mark all read' }).click();
  await expect(bell(page)).toHaveAccessibleName('Notifications');
  await expect(panel.getByLabel('Unread')).toHaveCount(0);
  expect(await unread(request, state.first.token)).toBe(0);
  // Reading one user's notifications changes nobody else's.
  expect(await unread(request, state.second.token)).toBe(1);
});

test('nobody can read or mark another user\'s notifications, the admin included', async ({ request }) => {
  const admin = await token(request, 'admin');
  const target = (await notifications(request, state.second.token))[0]!;
  expect(target.readAt).toBeNull();

  for (const other of [admin, state.first.token, await token(request, 'buyer')]) {
    expect((await call(request, 'post', `/notifications/${target.id}/read`, other)).status()).toBe(404);
    expect((await notifications(request, other)).some(item => item.id === target.id)).toBe(false);
  }
  // Mark-all-read by someone else leaves it unread.
  expect((await call(request, 'post', '/notifications/read-all', admin)).status()).toBe(200);
  expect(await unread(request, state.second.token)).toBe(1);
  expect((await request.get(API + '/notifications')).status()).toBe(401);
  expect((await call(request, 'post', `/notifications/${target.id}/read`)).status()).toBe(401);

  // The owner can.
  const own = await call(request, 'post', `/notifications/${target.id}/read`, state.second.token);
  expect((await own.json()).data).toEqual({ changed: true });
  expect(await unread(request, state.second.token)).toBe(0);
});
