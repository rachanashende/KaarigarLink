import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00Z')); });
async function login(page: Page, role = 'Buyer') {
  await page.goto('/login'); await page.getByRole('button', { name: 'Demo ' + role, exact: true }).click();
  await expect(page).toHaveURL('/' + role.toLowerCase() + '/dashboard');
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL('/login');
}
async function invite(page: Page) {
  await login(page); await page.goto('/buyer/jobs/job-1/matches');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true }) });
  await card.getByRole('button', { name: 'Invite workshop' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('status')).toContainText('Invitation recorded');
  await logout(page); await page.getByLabel('Email address').fill('deccan@kaarigarlink.example');
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/workshop/dashboard');
  await page.goto('/workshop/invitations');
  await page.getByRole('table', { name: 'Workshop invitations' }).getByRole('link').click();
}
async function respond(page: Page, response: 'Accept' | 'Decline') {
  await page.getByRole('button', { name: response + ' invitation', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: response + ' invitation', exact: true }).click();
  await expect(page.getByText('Mock invitation ' + (response === 'Accept' ? 'accepted.' : 'declined.'), { exact: true })).toBeVisible();
}
async function fillQuote(page: Page, amount = '55000') {
  await page.getByLabel('Quoted total (INR)', { exact: true }).fill(amount);
  await page.getByLabel('Estimated delivery', { exact: true }).fill('2026-12-13');
  await page.getByLabel('Quotation notes').fill('Workshop workflow browser verification');
}
async function submit(page: Page) {
  await page.getByRole('button', { name: 'Submit quote', exact: true }).click(); await fillQuote(page);
  await page.getByRole('button', { name: 'Review mock quotation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit quotation', exact: true }).click();
  await expect(page.getByText('Mock quotation submitted.', { exact: true })).toBeVisible();
}

test('accept, submit, compare, edit and withdraw share persisted records without award or order creation', async ({ page }, testInfo) => {
  test.slow(); await invite(page); const invitationPath = new URL(page.url()).pathname;
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kaarigarlink.demo-data.v1')!));
  await respond(page, 'Accept'); await submit(page);
  await page.reload(); await expect(page.getByRole('table', { name: 'Workshop quotation history' })).toContainText('55,000.00');
  await logout(page); await login(page); await page.goto('/buyer/jobs/job-1/matches');
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true }) })).toContainText('Invitation: Accepted');
  await page.goto('/buyer/jobs/job-1/quotes');
  const row = page.getByRole('row').filter({ hasText: 'Deccan Toolcraft' });
  await expect(row).toContainText('55,000.00'); await expect(row).toContainText('Submitted');
  await row.getByRole('button', { name: 'Review award' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Award order', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await logout(page);
  await page.getByLabel('Email address').fill('deccan@kaarigarlink.example'); await page.getByLabel('Password', { exact: true }).fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL('/workshop/dashboard');
  await page.goto(invitationPath); await page.getByRole('button', { name: 'Edit quote' }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByLabel('Quoted total (INR)', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('phase-8b3-edit-390.png'), fullPage: true });
  await fillQuote(page, '56000'); await page.getByRole('button', { name: 'Review mock quotation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save quotation changes' }).click();
  await expect(page.getByText('Mock quotation updated.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw quote' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Withdraw quotation', exact: true }).click();
  await expect(page.getByText('Mock quotation withdrawn.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('table', { name: 'Workshop quotation history' })).toContainText('WITHDRAWN');
  await expect(page.getByRole('button', { name: 'Edit quote' })).toBeDisabled();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('kaarigarlink.demo-data.v1')!));
  expect(after.jobs).toEqual(before.jobs); expect(after.inspectionUpdates).toEqual(before.inspectionUpdates); expect(after.quotes).toHaveLength(before.quotes.length + 1);
  await page.goto('/workshop/orders'); await expect(page.getByRole('heading', { name: 'No assigned orders' })).toBeVisible();
  await logout(page); await login(page); await page.goto('/buyer/jobs/job-1/quotes');
  await expect(page.getByRole('row').filter({ hasText: 'Deccan Toolcraft' })).toContainText('Withdrawn');
  await expect(page.getByRole('row').filter({ hasText: 'Deccan Toolcraft' })).toContainText('56,000.00');
});

test('decline is terminal, survives reload and appears in Buyer matching', async ({ page }) => {
  test.slow(); await invite(page); await respond(page, 'Decline'); await page.reload();
  for (const name of ['Accept invitation', 'Decline invitation', 'Submit quote']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await logout(page); await login(page); await page.goto('/buyer/jobs/job-1/matches');
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true }) })).toContainText('Invitation: Declined');
});

test('keyboard confirmations, validation and responsive quote forms retain safe boundaries', async ({ page }, testInfo) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await invite(page);
  const accept = page.getByRole('button', { name: 'Accept invitation', exact: true });
  await accept.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Accept invitation', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(accept).toBeFocused();
  await respond(page, 'Accept'); await page.getByRole('button', { name: 'Submit quote', exact: true }).click();
  await page.getByRole('button', { name: 'Review mock quotation' }).click();
  await expect(page.getByLabel('Quoted total (INR)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await fillQuote(page); await page.getByLabel('Estimated delivery', { exact: true }).fill('2026-12-16');
  await page.getByRole('button', { name: 'Review mock quotation' }).click();
  await expect(page.getByLabel('Estimated delivery', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).not.toBeVisible(); await fillQuote(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(page.getByLabel('Quoted total (INR)', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('phase-8b3-quotation-' + width + '.png'), fullPage: true });
    await page.getByRole('button', { name: 'Review mock quotation' }).click();
    await expect(dialog.getByRole('button', { name: 'Submit quotation', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('phase-8b3-confirmation-' + width + '.png'), fullPage: true });
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Cancel quotation' }).click();
  await expect(page.getByRole('form', { name: 'Mock quotation form' })).toHaveCount(0);
  await page.goto('/workshop/profile'); await expect(page.getByRole('button', { name: 'Edit profile' })).toBeDisabled();
  expect(errors).toEqual([]);
});
