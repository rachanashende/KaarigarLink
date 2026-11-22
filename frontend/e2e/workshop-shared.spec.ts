import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00.000Z')); });
async function login(page: Page, role = 'Workshop') {
  await page.goto('/login'); await page.getByRole('button', { name: 'Demo ' + role, exact: true }).click();
  await expect(page).toHaveURL('/' + role.toLowerCase() + '/dashboard');
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL('/login');
}
async function deccanLogin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('deccan@kaarigarlink.example');
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/workshop/dashboard');
}
test('canonical workshop metrics, invitation detail, own quote history and account/profile reads', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('group', { name: 'Total invitations', exact: true })).toContainText('1');
  await expect(page.getByRole('group', { name: 'Submitted quotations', exact: true })).toContainText('1');
  await expect(page.getByRole('group', { name: 'Active orders', exact: true })).toContainText('4');
  await expect(page.getByRole('group', { name: 'Open rework requests', exact: true })).toContainText('2');
  await page.goto('/workshop/invitations');
  const table = page.getByRole('table', { name: 'Workshop quotation history' });
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByText('quote-2', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'seed-invitation-1', exact: true }).click();
  await expect(page).toHaveURL('/workshop/invitations/seed-invitation-1');
  await expect(page.getByRole('heading', { name: 'Invitation details', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('dd').filter({ hasText: /^Machine aluminium mounting brackets$/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Workshop quotation history' })).toContainText('₹58,000.00');
  for (const name of ['Accept invitation', 'Decline invitation', 'Submit quote']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  for (const name of ['Edit quote', 'Withdraw quote']) await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
  await page.goto('/workshop/profile');
  await expect(page.getByRole('table', { name: 'Published workshop capacity' })).toContainText('500 pieces');
  await expect(page.getByRole('table', { name: 'Workshop machinery' })).toContainText('3-axis CNC mill');
  await page.goto('/workshop/settings');
  await expect(page.getByText('workshop@kaarigarlink.example', { exact: true })).toBeVisible();
  await page.goto('/workshop/onboarding');
  await expect(page.getByText('Canonical profile linked', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBeNull();
});
test('buyer invitation persists into the addressed workshop only and shared reset restores every role', async ({ page }) => {
  test.slow(); await login(page, 'Buyer'); await page.goto('/buyer/jobs/job-1/matches');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true }) });
  await card.getByRole('button', { name: 'Invite workshop' }).click();
  await page.getByRole('dialog', { name: 'Invite this workshop?' }).getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('status')).toContainText('Invitation recorded');
  const stored = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  await logout(page); await deccanLogin(page);
  await expect(page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Total invitations', exact: true })).toContainText('1');
  await page.goto('/workshop/invitations');
  await expect(page.getByRole('table', { name: 'Workshop invitations' })).toContainText('PENDING');
  await expect(page.getByRole('heading', { name: 'No quotations recorded' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', { name: 'Workshop invitations' })).toContainText('Machine aluminium mounting brackets');
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(stored);
  await page.goto('/workshop/orders/order-production');
  await expect(page.getByRole('heading', { name: 'Order unavailable' })).toBeVisible();
  await page.goto('/workshop/invitations/seed-invitation-1');
  await expect(page.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible();
  await logout(page); await login(page);
  await expect(page.getByRole('group', { name: 'Total invitations', exact: true })).toContainText('1');
  await logout(page); await login(page, 'Admin');
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await logout(page); await deccanLogin(page); await page.goto('/workshop/invitations');
  await expect(page.getByRole('heading', { name: 'No invitations recorded' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBeNull();
});
test('submitted QC is shared with workshop while drafts, attachments, lifecycle and payment stay separate', async ({ page }) => {
  test.slow(); await login(page, 'Inspector'); await page.goto('/inspector/inspections/inspection-qc');
  for (const label of ['Dimensional accuracy', 'Material conformity', 'Surface finish', 'Quantity verification']) await page.getByLabel(label + ' result', { exact: true }).selectOption('PASS');
  const summary = 'Workshop shared inspection confirmed dimensional and material requirements.';
  await page.getByLabel('Overall inspection summary', { exact: true }).fill(summary);
  await page.getByLabel('Dimensional accuracy evidence', { exact: true }).setInputFiles({ name: 'private-workshop-qc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic-only') });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await logout(page); await login(page); await page.goto('/workshop/orders/order-qc');
  await expect(page.getByRole('table', { name: 'Workshop production milestones' })).toBeVisible();
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0);
  await logout(page); await login(page, 'Inspector'); await page.goto('/inspector/inspections/inspection-qc');
  await page.getByLabel('Dimensional accuracy evidence', { exact: true }).setInputFiles({ name: 'private-workshop-qc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic-only') });
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record QC decision' }).click();
  await expect(page.getByRole('status')).toContainText('Mock QC decision recorded');
  const stored = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  await logout(page); await login(page); await page.goto('/workshop/orders/order-qc');
  await expect(page.getByText(summary, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('QC PENDING', { exact: true })).toBeVisible();
  await expect(page.getByText('ACCEPTED', { exact: true })).toHaveCount(2);
  await expect(page.getByText('No payment record supplied', { exact: true })).toBeVisible();
  await expect(page.getByText('private-workshop-qc.pdf', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update production status' })).toBeDisabled();
  await page.reload(); await expect(page.getByText(summary, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(stored);
});
test('shared malformed storage warns, retains canonical reads and recovers through existing reset', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('kaarigarlink.demo-data.v1', '{malformed'));
  await page.reload(); await page.getByRole('button', { name: 'Demo Workshop', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Active orders', exact: true })).toContainText('4');
  await expect(page.getByRole('alert')).toContainText('Saved demo data could not be restored');
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe('{malformed');
  await logout(page); await login(page, 'Admin');
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await logout(page); await login(page);
  await expect(page.getByRole('group', { name: 'Active orders', exact: true })).toContainText('4');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBeNull();
});
test('shared workshop screens remain readable at desktop and mobile widths', async ({ page }, testInfo) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await login(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path] of [
      ['dashboard', 'dashboard'], ['invitations', 'invitations'], ['invitation-detail', 'invitations/seed-invitation-1'],
      ['orders', 'orders'], ['order-detail', 'orders/order-production'], ['profile', 'profile'], ['settings', 'settings'], ['onboarding', 'onboarding'],
    ]) {
      await page.goto('/workshop/' + path);
      await expect(page.getByRole('heading', { name: 'Workshop workflow availability', exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      if (width === 390 && ['invitations', 'orders'].includes(name!)) expect(await page.getByLabel('Search ' + name).evaluate(element => element.clientWidth)).toBeGreaterThan(300);
      await page.screenshot({ path: testInfo.outputPath('phase-8b2-' + name + '-' + width + '.png'), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});
