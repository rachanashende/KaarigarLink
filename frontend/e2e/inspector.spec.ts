import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00.000Z')); });

async function login(page: Page, role = 'Inspector') {
  await page.goto('/login');
  await page.getByRole('button', { name: role, exact: true }).click();
  await expect(page).toHaveURL('/' + role.toLowerCase() + '/dashboard');
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL('/login');
}
async function fillFindings(page: Page) {
  for (const label of ['Dimensional accuracy', 'Material conformity', 'Surface finish', 'Quantity verification']) await page.getByLabel(label + ' result', { exact: true }).selectOption('PASS');
  await page.getByLabel('Overall inspection summary', { exact: true }).fill('All measured dimensions meet drawing revision B.');
  await page.getByLabel('Dimensional accuracy evidence', { exact: true }).setInputFiles({ name: 'private-qc-report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic evidence only') });
}
test('derived dashboard, assignment search/filter/sort and keyboard detail navigation', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('group', { name: 'Total assigned inspections', exact: true })).toContainText('5');
  await expect(page.getByRole('group', { name: 'Overdue inspections', exact: true })).toContainText('1');
  await page.getByRole('link', { name: 'All inspections', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('5 of 5 inspections');
  await page.getByLabel('Search inspections, orders, jobs or workshops').fill('sensor');
  await expect(page.getByRole('status')).toHaveText('1 of 5 inspections');
  await page.getByLabel('QC status', { exact: true }).selectOption('ACCEPTED');
  await expect(page.getByRole('heading', { name: 'No inspections found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('status')).toHaveText('5 of 5 inspections');
  await page.getByLabel('Sort deadlines').selectOption('latest');
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('inspection-rework');
  const link = page.getByRole('link', { name: 'inspection-qc', exact: true });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'inspection-qc', exact: true })).toBeVisible();
  await expect(page.getByText('Order production status', { exact: true })).toBeVisible();
  await expect(page.getByText('QC inspection status', { exact: true })).toBeVisible();
});
test('partial draft survives reload while evidence metadata stays in memory', async ({ page }) => {
  await login(page);
  await page.goto('/inspector/inspections/inspection-qc');
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await expect(page.getByRole('alert')).toContainText('inspection summary');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByLabel('Overall inspection summary', { exact: true }).fill('Draft measurements are still being reviewed.');
  await page.getByLabel('Material conformity result', { exact: true }).selectOption('PASS');
  await page.getByLabel('Dimensional accuracy evidence', { exact: true }).setInputFiles({ name: 'private-draft.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic-only') });
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved. No QC decision');
  await page.reload();
  await expect(page.getByLabel('Overall inspection summary', { exact: true })).toHaveValue('Draft measurements are still being reviewed.');
  await expect(page.getByLabel('Material conformity result', { exact: true })).toHaveValue('PASS');
  await expect(page.getByText('private-draft.pdf', { exact: false })).toHaveCount(0);
  const raw = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  expect(raw).not.toContain('private-draft.pdf'); expect(raw).not.toContain('synthetic-only');
  await expect(page.getByText('Saved draft findings · not submitted')).toBeVisible();
});
test('confirmed acceptance is duplicate-safe, survives reload and appears in buyer QC', async ({ page }) => {
  await login(page);
  await page.goto('/inspector/inspections/inspection-qc');
  await fillFindings(page);
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm mock QC decision' });
  await expect(dialog).toContainText('4 passed; 0 failed');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Record QC decision' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Review QC decision' })).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Record QC decision' }).dblclick();
  await expect(page.getByRole('status')).toContainText('Mock QC decision recorded');
  await expect(page.getByRole('button', { name: 'Review QC decision' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('This assignment already has a submitted decision.', { exact: false })).toBeVisible();
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('kaarigarlink.demo-data.v1')!));
  expect(raw.inspectionUpdates.find((item: { inspectionId: string }) => item.inspectionId === 'inspection-qc').history).toHaveLength(1);
  await logout(page); await login(page, 'Buyer');
  await page.goto('/buyer/orders/order-qc');
  await expect(page.getByRole('heading', { name: 'order-qc', exact: true })).toBeVisible();
  await expect(page.getByText('QC pending', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quality & rework' }).locator('..')).toContainText('Accepted');
  await expect(page.getByText('All measured dimensions meet drawing revision B.')).toBeVisible();
});
test('rework validates reason/deadline, records failed findings and appears in tracking/history/buyer', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page); await page.goto('/inspector/inspections/inspection-qc'); await fillFindings(page);
  await page.getByLabel('Proposed QC decision').selectOption('REWORK');
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await expect(page.getByLabel('Rework reason', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Rework reason', { exact: true }).fill('The bore finish exceeds drawing tolerance.');
  await page.getByLabel('Corrective action notes', { exact: true }).fill('Refinish the bore and provide a fresh dimensional report.');
  await page.getByLabel('Rework deadline', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await expect(page.getByRole('alert').first()).toContainText('future date');
  await page.getByLabel('Rework deadline', { exact: true }).fill('2099-01-01');
  await page.getByLabel('Surface finish result', { exact: true }).selectOption('FAIL');
  await page.getByLabel('Surface finish notes', { exact: true }).fill('Bore surface finish is outside the specified tolerance.');
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await page.screenshot({ path: testInfo.outputPath('phase-5-decision-confirmation.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Record QC decision' }).click();
  await expect(page.getByRole('status')).toContainText('Mock QC decision recorded');
  await page.goto('/inspector/rework');
  await expect(page.getByRole('status')).toHaveText('3 of 3 rework cases');
  await expect(page.getByRole('table')).toContainText('The bore finish exceeds drawing tolerance.');
  await page.getByLabel('Follow-up status').selectOption('overdue');
  await expect(page.getByRole('status')).toHaveText('1 of 3 rework cases');
  await page.goto('/inspector/history');
  await expect(page.getByRole('status')).toHaveText('5 submitted decisions');
  await expect(page.getByRole('table')).toContainText('The bore finish exceeds drawing tolerance.');
  await logout(page); await login(page, 'Buyer'); await page.goto('/buyer/orders/order-qc');
  await expect(page.getByText('Rework deadline: 1 Jan 2099')).toBeVisible();
  await expect(page.getByText('QC pending', { exact: true })).toBeVisible();
});
test('missing assignments, role guards and reset retain correct boundaries', async ({ page }) => {
  await login(page);
  await page.goto('/inspector/inspections/missing');
  await expect(page.getByRole('heading', { name: 'Inspection unavailable' })).toBeVisible();
  await page.goto('/inspector/inspections/inspection-qc'); await fillFindings(page);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.goto('/inspector/dashboard');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/inspector/inspections/inspection-qc');
  await expect(page.getByLabel('Overall inspection summary', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Dimensional accuracy result', { exact: true })).toHaveValue('UNRECORDED');
  await logout(page); await login(page, 'Buyer');
  for (const route of ['/inspector/dashboard', '/inspector/inspections', '/inspector/inspections/inspection-qc', '/inspector/rework', '/inspector/history']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  }
});
test('inspector screens fit desktop/tablet/mobile and support keyboard mobile navigation', async ({ page }, testInfo) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await login(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, label] of [['/inspector/dashboard', 'dashboard'], ['/inspector/inspections', 'inspections'], ['/inspector/inspections/inspection-qc', 'checklist'], ['/inspector/rework', 'rework'], ['/inspector/history', 'history']]) {
      await page.goto(route!); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (label === 'checklist') await expect(page.getByLabel('Overall inspection summary', { exact: true })).toBeVisible();
      if (label === 'dashboard') await expect(page.getByRole('group', { name: 'Total assigned inspections', exact: true })).toBeVisible();
      if (label === 'inspections' || label === 'rework' || label === 'history') await expect(page.getByRole('table')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath('phase-5-' + label + '-' + width + '.png'), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Mobile workspace navigation' });
  const link = nav.getByRole('link', { name: 'Assigned inspections', exact: true });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const region = page.getByRole('region', { name: 'Assigned inspections', exact: true });
  await region.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
