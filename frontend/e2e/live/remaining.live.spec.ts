import fs from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, PDF, RUN, call, signIn, signOut, token } from './support';

/**
 * M13 follow-up to the browser test report: the cases the side-panel run could not cover.
 * Setup uses the API; the behaviour under test goes through the UI where there is one.
 */
const WORKSHOP_ID = 'seed-ws-precision-works';
const INSPECTOR_ID = 'seed-user-inspector';
let seq = 0;

async function fresh(page: Page) {
  await page.goto('/login');
  await signOut(page);
}
async function newJob(request: APIRequestContext, buyer: string, material = 'aluminium') {
  seq += 1;
  const title = `E2E remaining ${RUN}-${seq}`;
  const res = await call(request, 'post', '/jobs', buyer, {
    title, description: 'Remaining verification.', material, manufacturingProcess: 'CNC_MACHINING', quantity: 10,
    deadline: new Date(Date.now() + 25 * 86_400_000).toISOString(), address: 'Pune, Maharashtra',
  });
  expect(res.status(), await res.text()).toBe(201);
  return { id: (await res.json()).data.job.id as string, title };
}
async function invite(request: APIRequestContext, buyer: string, jobId: string) {
  const inv = await call(request, 'post', `/jobs/${jobId}/invitations`, buyer, { workshopId: WORKSHOP_ID });
  expect(inv.status(), await inv.text()).toBe(201);
  return (await inv.json()).data.invitation.id as string;
}
/** Job -> invitation -> quote -> award -> inspector assigned -> production started. */
async function startedOrder(request: APIRequestContext) {
  const buyer = await token(request, 'buyer'); const workshop = await token(request, 'workshop'); const admin = await token(request, 'admin');
  const job = await newJob(request, buyer);
  const invitationId = await invite(request, buyer, job.id);
  expect((await call(request, 'post', `/invitations/${invitationId}/respond`, workshop, { response: 'ACCEPTED' })).status()).toBe(200);
  const quote = await call(request, 'post', `/quotes/invitations/${invitationId}`, workshop, { totalPrice: '18000.00', estimatedDays: 10 });
  const award = await call(request, 'post', '/orders/award/' + (await quote.json()).data.quote.id, buyer);
  expect(award.status(), await award.text()).toBe(201);
  const orderId = (await award.json()).data.order.id as string;
  expect((await call(request, 'put', `/orders/${orderId}/inspector`, admin, { inspectorId: INSPECTOR_ID })).status()).toBe(201);
  expect((await call(request, 'post', `/orders/${orderId}/start`, workshop)).status()).toBe(200);
  return { job, orderId, buyer, workshop, admin };
}

test.describe('buyer', () => {
  test('profile changes persist after a reload and a new sign-in', async ({ page }) => {
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/profile');
    const phone = '+91 98200 ' + String(Date.now()).slice(-5);
    await page.getByLabel('Phone').fill(phone);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Phone')).toHaveValue(phone);
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/profile');
    await expect(page.getByLabel('Phone')).toHaveValue(phone);
  });

  test('a negative or zero payment is refused in the UI and by the server; nothing is recorded', async ({ page, request }) => {
    const { orderId, buyer } = await startedOrder(request);
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/orders/' + orderId);
    for (const value of ['-5', '0']) {
      await page.getByLabel('Amount (INR)').fill(value);
      await page.getByRole('button', { name: 'Create payment' }).click();
      await expect(page.getByRole('region', { name: 'Payments', exact: true }).getByRole('alert')).toBeVisible();
    }
    expect((await (await call(request, 'get', `/orders/${orderId}/payments`, buyer)).json()).data.payments).toHaveLength(0);
    expect((await call(request, 'post', `/orders/${orderId}/payments`, buyer, { amount: '-5.00' })).status()).toBe(400);
  });

  test('BUG-02/06: partial payment shows the same totals for buyer and workshop; the banner follows the action', async ({ page, request }) => {
    const { orderId } = await startedOrder(request);
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/orders/' + orderId);
    await page.getByLabel('Amount (INR)').fill('5000');
    await page.getByRole('button', { name: 'Create payment' }).click();
    const payments = page.getByRole('region', { name: 'Payments', exact: true });
    await expect(payments.getByText('Payment created as PENDING. Record the simulated gateway result below.')).toBeVisible();
    await payments.getByRole('button', { name: 'Mark paid' }).click();
    await expect(payments.getByText('Payment marked as paid (simulated).')).toBeVisible();
    await expect(payments.getByText('Payment created as PENDING', { exact: false })).toHaveCount(0);
    await expect(payments).toContainText('Payment status: Partly paid');
    await page.screenshot({ path: test.info().outputPath('bug-02-06-buyer-payments.png'), fullPage: true });

    await fresh(page);
    await signIn(page, 'workshop');
    await page.goto('/workshop/orders/' + orderId);
    const facts = page.getByText('Agreed ₹18,000.00 · Paid ₹5,000.00 · Pending ₹0.00 · Remaining ₹13,000.00');
    await expect(facts).toBeVisible();
    await expect(page.getByText('Partly paid', { exact: true })).toBeVisible();
    await expect(page.getByText('SIMULATED_PAID')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('bug-02-workshop-payments.png'), fullPage: true });
  });

  test('a job cannot be cancelled once awarded; the cancel control is gone', async ({ page, request }) => {
    const { job, buyer } = await startedOrder(request);
    expect((await call(request, 'put', '/jobs/' + job.id, buyer, { status: 'CANCELLED' })).status()).toBe(409);
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/jobs/' + job.id);
    await expect(page.getByRole('heading', { name: job.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel job' })).toHaveCount(0);
  });

  test('BUG-01/05: job page copy is accurate and the delivery location appears once', async ({ page, request }) => {
    const buyer = await token(request, 'buyer');
    const job = await newJob(request, buyer);
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/jobs/' + job.id);
    await expect(page.getByText('compare their quotations and award one', { exact: false })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Order awarding remains unavailable');
    await expect(page.locator('body')).not.toContainText('Pune, Maharashtra, Pune, Maharashtra');
    await expect(page.getByText('Pune, Maharashtra', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('bug-01-05-job-detail.png'), fullPage: true });
  });
});

test.describe('workshop', () => {
  test('declines an invitation in the UI; the buyer sees it declined; it cannot be reopened', async ({ page, request }) => {
    const buyer = await token(request, 'buyer');
    const job = await newJob(request, buyer);
    const invitationId = await invite(request, buyer, job.id);
    await fresh(page);
    await signIn(page, 'workshop');
    await page.goto('/workshop/invitations/' + invitationId);
    // BUG-08: the job creation date is shown.
    await expect(page.getByRole('term').filter({ hasText: 'Job created' }).locator('xpath=following-sibling::dd[1]')).not.toHaveText('Not recorded');
    await page.screenshot({ path: test.info().outputPath('bug-08-invitation.png'), fullPage: true });
    await page.getByRole('button', { name: 'Decline invitation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Decline invitation' }).click();
    await expect(page.getByText('Invitation declined.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeDisabled();
    const workshop = await token(request, 'workshop');
    expect((await call(request, 'post', `/invitations/${invitationId}/respond`, workshop, { response: 'ACCEPTED' })).status()).toBe(409);

    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto(`/buyer/jobs/${job.id}/matches`);
    await expect(page.getByRole('article', { name: 'Precision Works' })).toContainText('Invitation: Declined');
  });

  test('prohibited milestone transitions are refused by the server', async ({ request }) => {
    const { orderId, workshop, buyer } = await startedOrder(request);
    const created = await call(request, 'post', `/orders/${orderId}/milestones`, workshop, { title: 'Turning', sequence: 1 });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).data.milestone.id as string;
    expect((await call(request, 'post', `/milestones/${id}/complete`, workshop)).status()).toBe(409); // PENDING -> COMPLETED
    expect((await call(request, 'post', `/milestones/${id}/approve`, buyer)).status()).toBe(409);     // not completed yet
    expect((await call(request, 'post', `/milestones/${id}/start`, buyer)).status()).toBe(403);       // buyers cannot start
  });
});

test.describe('order completion, rating and consistency', () => {
  test('PASSED -> complete -> rate in the UI; a second rating is refused; status survives reload and re-login', async ({ page, request }) => {
    const { orderId, buyer } = await startedOrder(request);
    const inspector = await token(request, 'inspector');
    // Completion is blocked until a PASSED inspection.
    expect((await call(request, 'post', `/orders/${orderId}/complete`, buyer)).status()).toBe(409);
    expect((await call(request, 'post', `/orders/${orderId}/inspections`, inspector, { status: 'PASSED', findings: 'All dimensions within tolerance.' })).status()).toBe(201);

    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/orders/' + orderId);
    await page.getByRole('button', { name: 'Complete order' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Complete order' }).click();
    await expect(page.getByText('Order completed.')).toBeVisible();

    await page.goto(`/buyer/orders/${orderId}/review`);
    await page.getByLabel('Workshop rating').selectOption('4');
    await page.getByLabel('Written feedback').fill('Good finish, slightly late.');
    await page.getByRole('button', { name: 'Review submission' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText('Good finish, slightly late.')).toBeVisible();

    // Duplicate prevention: no form after reload, and the API refuses a second rating.
    await page.reload();
    await expect(page.getByText('Good finish, slightly late.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review submission' })).toHaveCount(0);
    expect((await call(request, 'post', `/orders/${orderId}/rating`, buyer, { score: 1, review: 'Second try' })).status()).toBe(409);

    // Final status after refresh and after a new sign-in, for buyer and workshop.
    await page.goto('/buyer/orders/' + orderId);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Order actions' })).toContainText('This order is completed');
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/orders/' + orderId);
    await expect(page.getByRole('region', { name: 'Order actions' })).toContainText('This order is completed');
    const activity = page.getByRole('region', { name: 'Order activity' });
    for (const label of [/order completed/, /rating submitted/]) await expect(activity.getByText(label).first()).toBeVisible();
    await fresh(page);
    await signIn(page, 'workshop');
    await page.goto('/workshop/orders/' + orderId);
    await expect(page.getByText(/closed|completed/i).first()).toBeVisible();
    const workshopToken = await token(request, 'workshop');
    expect((await (await call(request, 'get', '/orders/' + orderId, workshopToken)).json()).data.order.status).toBe('COMPLETED');
  });
});

test.describe('documents and evidence', () => {
  async function jobPage(page: Page, request: APIRequestContext) {
    const buyer = await token(request, 'buyer');
    const job = await newJob(request, buyer);
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto('/buyer/jobs/' + job.id);
    const region = page.getByRole('region', { name: 'Stored design files' });
    await expect(region).toBeVisible();
    return { job, buyer, region, input: region.getByLabel('Upload files') };
  }
  // A real 1x1 PNG.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  test('valid PDF and image upload with correct metadata; the download is byte-identical', async ({ page, request }) => {
    const { job, buyer, region, input } = await jobPage(page, request);
    await input.setInputFiles([{ name: 'drawing.pdf', mimeType: 'application/pdf', buffer: PDF }, { name: 'photo.png', mimeType: 'image/png', buffer: PNG }]);
    await expect(region.getByText('2 file(s) uploaded.')).toBeVisible();
    const docs = (await (await call(request, 'get', `/jobs/${job.id}/documents`, buyer)).json()).data.documents as { originalName: string; mimeType: string; sizeBytes: number; storageKey?: string }[];
    expect(docs.map(d => [d.originalName, d.mimeType, d.sizeBytes]).sort()).toEqual([['drawing.pdf', 'application/pdf', PDF.length], ['photo.png', 'image/png', PNG.length]]);
    expect(docs.every(d => d.storageKey === undefined)).toBe(true);

    const row = region.getByRole('listitem').filter({ hasText: 'photo.png' });
    const download = page.waitForEvent('download');
    await row.getByRole('button', { name: 'Download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('photo.png');
    expect(fs.readFileSync((await file.path())!).equals(PNG)).toBe(true);
  });

  test('unsupported extension, wrong MIME, spoofed contents and oversized files are refused with a message', async ({ page, request }) => {
    const { job, buyer, region, input } = await jobPage(page, request);
    const cases = [
      { name: 'tool.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ fake executable') },
      { name: 'drawing.pdf', mimeType: 'image/png', buffer: PDF },
      { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png') },
      { name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 1, 0x20)]) },
    ];
    for (const file of cases) {
      await input.setInputFiles(file);
      await expect(region.getByRole('alert')).toContainText(file.name + ':');
    }
    await expect(region.getByRole('alert')).toContainText(/larger than the server allows|too large/i);
    expect((await (await call(request, 'get', `/jobs/${job.id}/documents`, buyer)).json()).data.documents).toHaveLength(0);
  });

  test('another buyer and an uninvited workshop cannot list or download the files', async ({ request }) => {
    const buyer = await token(request, 'buyer');
    const job = await newJob(request, buyer);
    const up = await request.post(`${API}/jobs/${job.id}/documents`, { headers: { Authorization: 'Bearer ' + buyer, 'Content-Type': 'application/pdf', 'X-File-Name': 'secret.pdf' }, data: PDF });
    expect(up.status(), await up.text()).toBe(201);
    const id = (await up.json()).data.document.id as string;
    for (const who of ['otherBuyer', 'workshop'] as const) {
      const bearer = await token(request, who);
      expect((await call(request, 'get', `/jobs/${job.id}/documents`, bearer)).status(), who).toBe(404);
      expect((await call(request, 'get', `/documents/${id}/download`, bearer)).status(), who).toBe(404);
      expect((await call(request, 'delete', `/documents/${id}`, bearer)).status(), who).toBeGreaterThanOrEqual(403);
    }
    expect((await call(request, 'get', `/documents/${id}/download`)).status()).toBe(401);
  });

  test('evidence is immutable once its inspection is submitted', async ({ page, request }) => {
    const { orderId } = await startedOrder(request);
    const inspector = await token(request, 'inspector');
    const up = await request.post(`${API}/orders/${orderId}/documents`, { headers: { Authorization: 'Bearer ' + inspector, 'Content-Type': 'application/pdf', 'X-File-Name': 'edge.pdf' }, data: PDF });
    const documentId = (await up.json()).data.document.id as string;
    const submitted = await call(request, 'post', `/orders/${orderId}/inspections`, inspector, {
      status: 'FAILED', findings: 'Edge burrs on 3 parts.',
      checklist: { items: [{ id: 'finish', label: 'Finish', result: 'FAIL', notes: 'Burrs on three parts', evidence: [{ name: 'edge.pdf', mediaType: 'application/pdf', sizeBytes: PDF.length, documentId }] }] },
    });
    expect(submitted.status(), await submitted.text()).toBe(201);
    expect((await call(request, 'delete', `/documents/${documentId}`, inspector)).status()).toBe(409);

    await fresh(page);
    await signIn(page, 'inspector');
    await page.goto('/inspector/inspections');
    await page.getByRole('row').filter({ hasText: `E2E remaining ${RUN}` }).last().getByRole('link').first().click();
    const evidence = page.getByRole('region', { name: 'Inspection evidence' });
    await expect(evidence.getByText('edge.pdf', { exact: false })).toBeVisible();
    await expect(evidence.getByRole('listitem').filter({ hasText: 'edge.pdf' }).getByRole('button', { name: 'Delete' })).toHaveCount(0);
    // BUG-07: one accurate statement about evidence storage.
    await expect(page.locator('body')).not.toContainText('Files are metadata-only references');
    await page.screenshot({ path: test.info().outputPath('bug-07-inspection-evidence.png'), fullPage: true });
  });
});

test.describe('matching', () => {
  test('BUG-03/04: a material grade matches its base material and distance is explained honestly', async ({ page, request }) => {
    const buyer = await token(request, 'buyer');
    const job = await newJob(request, buyer, 'Aluminium 6061');
    await fresh(page);
    await signIn(page, 'buyer');
    await page.goto(`/buyer/jobs/${job.id}/matches`);
    const card = page.getByRole('article', { name: 'Precision Works' });
    await expect(card).toContainText('Eligible');
    await expect(card).toContainText('aluminium 6061 is a grade or form of aluminium');
    await expect(card).toContainText('Distance not scored: the job has no map coordinates');
    await expect(page.locator('body')).not.toContainText('Job has no location');
    await page.screenshot({ path: test.info().outputPath('bug-03-04-matches.png'), fullPage: true });
  });
});
