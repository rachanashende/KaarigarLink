import { expect, test, type Page } from '@playwright/test';
import { PDF, RUN, call, signIn, token } from './support';

/**
 * One manufacturing order end to end in live mode: buyer -> workshop -> buyer ->
 * admin -> workshop -> inspector -> buyer, through the real UI and backend.
 * Steps share state and run in order.
 */
test.describe.configure({ mode: 'serial' });

const state = { jobTitle: `E2E brackets ${RUN}`, jobId: '', orderId: '' };

function inIndiaInDays(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

/** "2026-12-22" -> "22 Dec 2026" (the app's en-IN medium date). */
function displayDate(day: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z'));
}

async function fresh(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => sessionStorage.clear());
}

test('buyer: edits the profile, posts a job with a design file, sees matches and invites a workshop', async ({ page }) => {
  await fresh(page);
  await signIn(page, 'buyer');

  await page.goto('/buyer/profile');
  const phone = page.getByLabel('Phone');
  await phone.fill('+91 98200 1' + RUN.slice(-4).replace(/\D/g, '1').padStart(4, '1'));
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();

  await page.goto('/buyer/jobs/new');
  await page.getByLabel('Job title').fill(state.jobTitle);
  await page.getByLabel('Manufacturing capability').fill('CNC machining');
  await page.getByLabel('Job description').fill('Aluminium mounting brackets for an end-to-end verification run.');
  await page.getByLabel('Material').fill('aluminium');
  await page.getByLabel('Required machinery or capabilities').fill('CNC mill');
  await page.getByLabel('Quantity', { exact: true }).fill('200');
  await page.getByLabel('Unit of measurement').fill('pieces');
  await page.getByLabel('Delivery deadline').fill(inIndiaInDays(30));
  await page.getByLabel('Budget (INR)').fill('150000');
  await page.getByLabel('Delivery city').fill('Pune');
  await page.getByLabel('State or union territory').fill('Maharashtra');
  await page.getByLabel('Design files').setInputFiles({ name: 'bracket-drawing.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Post job' }).click();

  await expect(page).toHaveURL(/\/buyer\/jobs\/(?!new$)[^/]+$/);
  state.jobId = decodeURIComponent(page.url().split('/').pop()!);
  await expect(page.getByRole('heading', { name: state.jobTitle })).toBeVisible();
  const stored = page.getByRole('region', { name: 'Stored design files' }).or(page.locator('section', { hasText: 'Stored design files' })).first();
  await expect(stored.getByText('bracket-drawing.pdf')).toBeVisible();
  const download = page.waitForEvent('download');
  await stored.getByRole('button', { name: 'Download' }).first().click();
  expect((await download).suggestedFilename()).toBe('bracket-drawing.pdf');

  await page.getByRole('link', { name: 'View workshop matches' }).first().click();
  await expect(page.getByRole('heading', { name: 'Workshop matches' })).toBeVisible();
  const row = page.locator('li, tr, article').filter({ hasText: 'Precision Works' }).filter({ has: page.getByRole('button', { name: 'Invite workshop' }) }).first();
  await row.getByRole('button', { name: 'Invite workshop' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  // Regression (M13): matches embed { id, status } invitations; the page must keep loading.
  await expect(page.getByRole('status').filter({ hasText: 'Invitation recorded for Precision Works' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('article', { name: 'Precision Works' }).getByText('Invitation: Pending')).toBeVisible();
});

test('workshop: sees the design file, accepts the invitation, submits and then edits a quote', async ({ page, request }) => {
  expect(state.jobId).not.toBe('');
  // The invited workshop may read the buyer's design files (backend rule); another buyer may not.
  const workshop = await token(request, 'workshop');
  const docsPath = '/jobs/' + state.jobId + '/documents';
  const docs = await call(request, 'get', docsPath, workshop);
  expect(docs.status(), docsPath + ' ' + (await docs.text())).toBe(200);
  expect((await docs.json()).data.documents).toHaveLength(1);
  expect((await call(request, 'get', docsPath, await token(request, 'otherBuyer'))).status()).toBe(404);

  await fresh(page);
  await signIn(page, 'workshop');
  await page.goto('/workshop/invitations');
  const invitationRow = page.getByRole('row').filter({ hasText: state.jobTitle });
  // Regression (M13): the deadline the buyer chose, not the day after.
  await expect(invitationRow.getByRole('cell', { name: displayDate(inIndiaInDays(30)) })).toBeVisible();
  await invitationRow.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Invitation response and quotation' })).toBeVisible();
  await expect(page.getByText('bracket-drawing.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByRole('button', { name: 'Submit quote' })).toBeEnabled();

  await page.getByRole('button', { name: 'Submit quote', exact: true }).click();
  await page.getByLabel('Quoted total (INR)', { exact: true }).fill('120000');
  await page.getByLabel('Estimated delivery', { exact: true }).fill(inIndiaInDays(20));
  await page.getByLabel('Quotation notes').fill('Anodised finish included.');
  await page.getByRole('button', { name: 'Review quotation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit quotation', exact: true }).click();
  await expect(page.getByText('Quotation submitted.', { exact: true })).toBeVisible();

  // Edit (version-checked by the backend's expectedUpdatedAt).
  await page.getByRole('button', { name: 'Edit quote' }).click();
  await page.getByLabel('Quoted total (INR)', { exact: true }).fill('118500');
  await page.getByRole('button', { name: 'Review quotation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save quotation changes', exact: true }).click();
  await expect(page.getByText('Quotation updated.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', { name: 'Workshop quotation history' })).toContainText('1,18,500.00');
});

test('buyer: compares quotations and awards the order', async ({ page, request }) => {
  await fresh(page);
  await signIn(page, 'buyer');
  await page.goto('/buyer/jobs/' + state.jobId + '/quotes');
  const row = page.getByRole('row').filter({ hasText: 'Precision Works' });
  await expect(row).toContainText('1,18,500.00');
  await row.getByRole('button', { name: 'Review award' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Award order', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const orders = await (await call(request, 'get', '/orders/mine', await token(request, 'buyer'))).json();
  const order = orders.data.orders.find((item: { jobId: string }) => item.jobId === state.jobId);
  expect(order, 'order created for the awarded job').toBeTruthy();
  state.orderId = order.id;
});

test('admin: verifies a workshop, assigns the inspector and filters the audit history', async ({ page }) => {
  expect(state.orderId).not.toBe('');
  await fresh(page);
  await signIn(page, 'admin');

  await page.goto('/admin/workshops/seed-ws-nashik-small-batch');
  const verify = page.getByRole('button', { name: 'Verify workshop' });
  await expect(verify.or(page.getByRole('button', { name: 'Return to pending' })).first()).toBeVisible();
  if (await verify.isDisabled()) {
    // Already verified by an earlier run against this database.
    await page.getByRole('button', { name: 'Return to pending' }).click();
    await expect(verify).toBeEnabled();
  }
  await verify.click();
  await expect(verify).toBeDisabled();

  await page.goto('/admin/orders/' + state.orderId);
  const assignment = page.getByRole('region', { name: 'Inspector assignment' });
  const select = assignment.getByLabel('Assign inspector');
  const value = await select.locator('option', { hasText: 'Priya Nair' }).getAttribute('value');
  await select.selectOption(value!);
  await assignment.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(assignment.getByText('Inspector assigned.')).toBeVisible();
  await expect(assignment.getByText(/Priya Nair/).first()).toBeVisible();

  await page.goto('/admin/audit');
  await page.getByLabel('Order ID').fill(state.orderId);
  await expect(page.getByText('QUOTE_AWARDED').or(page.getByText(/quote awarded/i)).first()).toBeVisible();
  await expect(page.getByText(/inspector assigned/i).or(page.getByText('INSPECTOR_ASSIGNED')).first()).toBeVisible();
  await page.getByLabel('Order ID').fill('');
  await page.getByLabel('Action').fill('WORKSHOP_VERIFICATION_VERIFIED');
  await expect(page.getByText(/Nashik Small Batch|seed-ws-nashik-small-batch/).first()).toBeVisible();
  // A filter with no matches offers to clear the filters.
  await page.getByLabel('Action').fill('NO_SUCH_ACTION_' + RUN);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('Action')).toHaveValue('');
});

test('workshop: starts production, plans a milestone and completes it', async ({ page }) => {
  await fresh(page);
  await signIn(page, 'workshop');
  await page.goto('/workshop/orders/' + state.orderId);
  const commands = page.getByRole('region', { name: 'Production commands' });
  await commands.getByRole('button', { name: 'Start production' }).click();
  await expect(commands.getByText('Production started.')).toBeVisible();

  await commands.getByLabel('Milestone title').fill('Machining and deburring');
  await commands.getByLabel('Sequence').fill('1');
  await commands.getByLabel('Due date').fill(inIndiaInDays(12));
  await commands.getByRole('button', { name: 'Add milestone' }).click();
  await expect(commands.getByText('Milestone added.')).toBeVisible();
  // Regression (M13): the due date shown is the one entered.
  await expect(page.getByText(displayDate(inIndiaInDays(12))).first()).toBeVisible();

  await commands.getByRole('button', { name: 'Start milestone' }).click();
  await expect(commands.getByText('Milestone started.')).toBeVisible();
  await commands.getByRole('button', { name: 'Complete milestone' }).click();
  await expect(commands.getByText(/Milestone completed/)).toBeVisible();
});

test('inspector: saves, restores and deletes a private draft, uploads evidence and requests rework', async ({ page }) => {
  await fresh(page);
  await signIn(page, 'inspector');
  await page.goto('/inspector/inspections');
  await page.getByRole('row').filter({ hasText: state.jobTitle }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Inspection checklist' })).toBeVisible();
  const inspectionUrl = page.url();

  const dims = page.getByLabel('Dimensions & tolerances result');
  await dims.selectOption('PASS');
  await page.getByLabel('Overall inspection summary').fill('Draft: dimensions checked on 5 samples.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved draft findings · not submitted')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Dimensions & tolerances result')).toHaveValue('PASS');
  await expect(page.getByLabel('Overall inspection summary')).toHaveValue('Draft: dimensions checked on 5 samples.');

  await page.getByRole('button', { name: /Delete draft/ }).click();
  await expect(page.getByText('New draft · not submitted')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Dimensions & tolerances result')).toHaveValue('UNRECORDED');

  // Structured QC with uploaded evidence, then a rework decision.
  for (const check of ['Dimensions & tolerances', 'Material', 'Quantity']) await page.getByLabel(check + ' result', { exact: true }).selectOption('PASS');
  await page.getByLabel('Surface finish & workmanship result').selectOption('FAIL');
  await page.getByLabel('Surface finish & workmanship notes').fill('Burrs on the mounting holes of 12 pieces.');
  await page.getByLabel('Surface finish & workmanship evidence').setInputFiles({ name: 'burrs.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByText(/burrs\.pdf/).first()).toBeVisible();
  await page.getByLabel('Overall inspection summary').fill('Finish defects found; rework the holes.');
  await page.getByLabel('Proposed QC decision').selectOption('REWORK');
  await page.getByLabel('Rework reason').fill('Burrs on mounting holes exceed the drawing tolerance.');
  await page.getByLabel('Corrective action notes').fill('Deburr and re-chamfer all mounting holes.');
  await page.getByLabel('Rework deadline').fill(inIndiaInDays(5));
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record QC decision' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto(inspectionUrl);
  await expect(page.getByText(/rework/i).first()).toBeVisible();
});

test('workshop: sees the rework decision and the inspector evidence, restarts and completes the milestone', async ({ page }) => {
  await fresh(page);
  await signIn(page, 'workshop');
  await page.goto('/workshop/orders/' + state.orderId);
  await expect(page.getByRole('region', { name: 'QC decisions and rework' })).toContainText(/rework/i);
  await expect(page.getByText('burrs.pdf').first()).toBeVisible();
  const commands = page.getByRole('region', { name: 'Production commands' });
  await commands.getByRole('button', { name: 'Restart for rework' }).click();
  await expect(commands.getByText('Milestone started.')).toBeVisible();
  await commands.getByRole('button', { name: 'Complete milestone' }).click();
  await expect(commands.getByText(/Milestone completed/)).toBeVisible();
});

test('admin: reassignment removes the previous inspector\'s access; the original inspector is reassigned', async ({ page, request }) => {
  // A second inspector (self-registered; inspectors may register, admins may not).
  const email = `e2e.inspector.${RUN}@example.test`;
  const secondName = 'Second Inspector ' + RUN;
  const reg = await call(request, 'post', '/auth/register', undefined, { name: secondName, email, password: 'E2e-Inspector-1', role: 'INSPECTOR' });
  expect(reg.status()).toBe(201);
  const second = (await reg.json()).data;

  await fresh(page);
  await signIn(page, 'admin');
  await page.goto('/admin/orders/' + state.orderId);
  const assignment = page.getByRole('region', { name: 'Inspector assignment' });
  const reassign = async (name: string) => {
    const select = assignment.getByLabel('Reassign to');
    await select.selectOption((await select.locator('option', { hasText: name }).getAttribute('value'))!);
    await assignment.getByRole('button', { name: 'Reassign', exact: true }).click();
    await expect(assignment.getByText('Inspector reassigned.')).toBeVisible();
  };
  await reassign(secondName);

  // The backend refuses the previous inspector, even when called directly.
  const priya = await token(request, 'inspector');
  for (const path of ['/orders/' + state.orderId, '/orders/' + state.orderId + '/documents', '/orders/' + state.orderId + '/history', '/orders/' + state.orderId + '/inspection-draft']) {
    expect((await call(request, 'get', path, priya)).status(), path).toBe(404);
  }
  expect((await call(request, 'post', '/orders/' + state.orderId + '/inspections', priya, { status: 'PASSED', findings: 'Not my order any more' })).status()).toBe(404);
  // The new inspector can read the order.
  expect((await call(request, 'get', '/orders/' + state.orderId, second.token)).status()).toBe(200);

  await reassign('Priya Nair');
  // The history keeps the ended assignment.
  await expect(assignment.getByRole('listitem').filter({ hasText: secondName })).toContainText('ended');
  await expect(assignment.getByText('Current inspector: Priya Nair', { exact: false })).toBeVisible();
});

test('inspector: records a PASSED inspection with a structured checklist', async ({ page }) => {
  await fresh(page);
  await signIn(page, 'inspector');
  await page.goto('/inspector/inspections');
  await page.getByRole('row').filter({ hasText: state.jobTitle }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Inspection checklist' })).toBeVisible();
  for (const check of ['Dimensions & tolerances', 'Material', 'Quantity', 'Surface finish & workmanship']) await page.getByLabel(check + ' result', { exact: true }).selectOption('PASS');
  await page.getByLabel('Overall inspection summary').fill('All checks pass after rework of the mounting holes.');
  await page.getByLabel('Proposed QC decision').selectOption('ACCEPTED');
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record QC decision' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('buyer: approves the milestone, pays, completes the order, rates the workshop and reads history and notifications', async ({ page }) => {
  await fresh(page);
  await signIn(page, 'buyer');
  await page.goto('/buyer/orders/' + state.orderId);
  await page.getByRole('button', { name: 'Approve milestone' }).click();
  await expect(page.getByRole('button', { name: 'Approve milestone' })).toHaveCount(0);

  await page.getByLabel('Amount (INR)').fill('118500');
  await page.locator('#payment-description').fill('Full payment');
  await page.getByRole('button', { name: 'Create payment' }).click();
  await expect(page.getByText('Payment created as PENDING. Record the simulated gateway result below.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.getByText(/SUCCEEDED|Paid/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Complete order' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Complete order' }).click();
  await expect(page.getByText('Order completed.')).toBeVisible();

  // Order activity comes from the append-only audit history.
  const activity = page.getByRole('region', { name: 'Order activity' });
  for (const label of [/quote awarded/, /inspector (re)?assigned/, /order started/, /^inspection/, /payment created/, /order completed/]) await expect(activity.getByText(label).first()).toBeVisible();

  await page.goto('/buyer/orders/' + state.orderId + '/review');
  await page.getByLabel('Workshop rating').selectOption('5');
  await page.getByLabel('Written feedback').fill('Clean rework and on-time delivery.');
  await page.getByRole('button', { name: 'Review submission' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /submit/i }).click();
  await expect(page.getByText('Clean rework and on-time delivery.')).toBeVisible();

  const bell = page.getByRole('button', { name: /^Notifications/ });
  await bell.click();
  await expect(page.getByText(/inspection|order/i).first()).toBeVisible();
  const markAll = page.getByRole('button', { name: 'Mark all read' });
  if (await markAll.isVisible()) await markAll.click();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});
