import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00.000Z')); });
async function login(page: Page, role = 'Admin') {
  await page.goto('/login'); await page.getByRole('button', { name: role, exact: true }).click();
  await expect(page).toHaveURL('/' + role.toLowerCase() + '/dashboard');
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL('/login');
}
test('admin metrics, user search/role/sort and linked account details', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('group', { name: 'Total registered users', exact: true })).toContainText('7');
  await expect(page.getByRole('group', { name: 'Active orders', exact: true })).toContainText('4');
  await expect(page.getByRole('group', { name: 'Open rework cases', exact: true })).toContainText('2');
  await page.getByRole('navigation', { name: 'Admin management' }).getByRole('link', { name: 'User directory', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('7 of 7 records');
  await page.getByLabel('Role', { exact: true }).selectOption('workshop');
  await expect(page.getByRole('status')).toHaveText('4 of 7 records');
  await page.getByLabel('Search users').fill('Sana');
  await expect(page.getByRole('status')).toHaveText('1 of 7 records');
  await page.getByLabel('Sort records').selectOption('name-desc');
  await page.getByRole('link', { name: 'Sana Kulkarni', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sana Kulkarni', exact: true })).toBeVisible();
  await expect(page.getByText('Not supplied by the current contract')).toBeVisible();
  await expect(page.getByRole('button', { name: /Delete|Suspend|Change role/ })).toHaveCount(0);
  await page.getByRole('main').getByRole('link', { name: 'Deccan Toolcraft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true })).toBeVisible();
});
test('workshop capability, job marketplace records and related navigation stay read-only', async ({ page }) => {
  await login(page); await page.goto('/admin/workshops');
  await page.getByLabel('Capability', { exact: true }).selectOption('Sheet metal fabrication');
  await expect(page.getByRole('status')).toHaveText('1 of 4 records');
  await page.getByRole('link', { name: 'Vishwakarma Sheet Metal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vishwakarma Sheet Metal', exact: true })).toBeVisible();
  await expect(page.getByText('Not supplied; no verification or suspension command exists')).toBeVisible();
  await page.getByRole('link', { name: 'Fabricate powder-coated control enclosures', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Job quotations', exact: true })).toContainText('₹1,18,000.00');
  await expect(page.getByRole('table', { name: 'Job match records', exact: true })).toContainText('91');
  await expect(page.getByRole('button', { name: /Award|Verify|Suspend/ })).toHaveCount(0);
  await page.goto('/admin/jobs');
  await page.getByLabel('Lifecycle status').selectOption('QUOTING');
  await expect(page.getByRole('status')).toHaveText('1 of 10 records');
  await page.getByLabel('Sort records').selectOption('deadline');
  await expect(page.getByRole('table')).toContainText('job-2');
});
test('order search/status, QC detail, overdue filter and alert keyboard links', async ({ page }) => {
  await login(page); await page.goto('/admin/orders');
  await page.getByLabel('Search orders').fill('impeller');
  await expect(page.getByRole('status')).toHaveText('1 of 6 records');
  await page.getByLabel('Lifecycle status').selectOption('REWORK');
  await page.getByRole('link', { name: 'order-rework', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'order-rework', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50');
  await page.getByRole('link', { name: 'inspection-rework', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'inspection-rework', exact: true })).toBeVisible();
  await expect(page.getByText('Surface finish: Fail')).toBeVisible();
  await expect(page.getByRole('button', { name: /Record QC|Save draft|Accept inspection/ })).toHaveCount(0);
  await page.goto('/admin/quality');
  await page.getByLabel('QC status', { exact: true }).selectOption('overdue');
  await expect(page.getByRole('status')).toHaveText('1 of 5 records');
  await expect(page.getByRole('table')).toContainText('inspection-overdue');
  await page.goto('/admin/dashboard');
  const alert = page.getByRole('link', { name: 'Production milestone overdue', exact: true });
  await alert.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'order-production', exact: true })).toBeVisible();
});
test('missing records remain unavailable for all five detail types', async ({ page }) => {
  await login(page);
  for (const section of ['users', 'workshops', 'jobs', 'orders', 'quality']) {
    await page.goto('/admin/' + section + '/missing');
    await expect(page.getByRole('heading', { name: 'Record unavailable', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Return to/ })).toHaveAttribute('href', '/admin/' + section);
  }
});
test('buyers, workshops and inspectors are denied admin lists and detail routes', async ({ page }) => {
  test.slow();
  for (const role of ['Buyer', 'Workshop', 'Inspector']) {
    await login(page, role);
    for (const route of ['/admin/dashboard', '/admin/users', '/admin/workshops', '/admin/jobs', '/admin/orders', '/admin/quality', '/admin/users/buyer-1', '/admin/quality/inspection-qc']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
    }
    await logout(page);
  }
});
test('inspector decisions persist consistently into admin and buyer views; admin reads do not write; reset restores seed', async ({ page }) => {
  test.slow(); await login(page, 'Inspector'); await page.goto('/inspector/inspections/inspection-qc');
  for (const label of ['Dimensional accuracy', 'Material conformity', 'Surface finish', 'Quantity verification']) await page.getByLabel(label + ' result', { exact: true }).selectOption('PASS');
  await page.getByLabel('Surface finish result', { exact: true }).selectOption('FAIL');
  await page.getByLabel('Surface finish notes', { exact: true }).fill('The measured finish exceeds the drawing tolerance.');
  await page.getByLabel('Overall inspection summary', { exact: true }).fill('Material and dimensions conform; surface finish needs correction.');
  await page.getByLabel('Dimensional accuracy evidence', { exact: true }).setInputFiles({ name: 'private-admin-consistency.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic-only') });
  await page.getByLabel('Proposed QC decision').selectOption('REWORK');
  await page.getByLabel('Rework reason', { exact: true }).fill('Surface finish requires correction before dispatch.');
  await page.getByLabel('Corrective action notes', { exact: true }).fill('Refinish the bore and present a fresh dimensional report.');
  await page.getByLabel('Rework deadline', { exact: true }).fill('2099-01-01');
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record QC decision' }).click();
  await expect(page.getByRole('status')).toContainText('Mock QC decision recorded');
  const stored = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  await logout(page); await login(page);
  await expect(page.getByRole('group', { name: 'Pending inspections', exact: true })).toContainText('0');
  await expect(page.getByRole('group', { name: 'Open rework cases', exact: true })).toContainText('3');
  await page.goto('/admin/quality/inspection-qc');
  await expect(page.getByRole('heading', { name: 'inspection-qc', exact: true })).toBeVisible();
  await expect(page.getByText('Surface finish requires correction before dispatch.', { exact: true })).toBeVisible();
  await expect(page.getByText('private-admin-consistency.pdf', { exact: false })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Surface finish requires correction before dispatch.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(stored);
  await logout(page); await login(page, 'Buyer'); await page.goto('/buyer/orders/order-qc');
  await expect(page.getByText('Rework deadline: 1 Jan 2099')).toBeVisible();
  await expect(page.getByText('QC pending', { exact: true })).toBeVisible();
  await logout(page); await login(page);
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('group', { name: 'Pending inspections', exact: true })).toContainText('1');
  await page.reload();
  await expect(page.getByRole('group', { name: 'Open rework cases', exact: true })).toContainText('2');
});
test('admin primary screens fit desktop/tablet/mobile with usable mobile navigation', async ({ page }, testInfo) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await login(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['dashboard', 'users', 'workshops', 'jobs', 'orders', 'quality']) {
      await page.goto('/admin/' + section);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (section === 'dashboard') await expect(page.getByRole('group', { name: 'Total registered users', exact: true })).toBeVisible();
      else await expect(page.getByRole('table')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath('phase-6-' + section + '-' + width + '.png'), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Mobile workspace navigation' });
  const link = nav.getByRole('link', { name: 'Users', exact: true });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const region = page.getByRole('region', { name: 'Platform users', exact: true });
  await region.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
test('admin record details fit all breakpoints and preserve keyboard related links', async ({ page }, testInfo) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await login(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [section, id] of [['users', 'buyer-1'], ['workshops', 'workshop-1'], ['jobs', 'job-1'], ['orders', 'order-rework'], ['quality', 'inspection-rework']]) {
      await page.goto('/admin/' + section + '/' + id);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Read-only platform record', { exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if ((section === 'orders' || section === 'quality') && (width === 1440 || width === 390)) await page.screenshot({ path: testInfo.outputPath('phase-6-' + section + '-detail-' + width + '.png'), fullPage: true });
    }
  }
  await page.goto('/admin/quality/inspection-rework');
  const link = page.getByRole('link', { name: 'order-rework', exact: true });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'order-rework', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
