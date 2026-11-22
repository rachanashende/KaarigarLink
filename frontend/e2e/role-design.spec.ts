import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00Z')); });
async function login(page: Page, role: string) {
  await page.goto('/login'); await page.getByRole('button', { name: role, exact: true }).click();
  await expect(page).toHaveURL('/' + role.toLowerCase() + '/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/^Loading /)).toHaveCount(0);
}
const screens = [
  ['Workshop', 'workshop-dashboard', '/workshop/dashboard', 'Workshop workspace'],
  ['Workshop', 'workshop-invitations', '/workshop/invitations', 'Invitations'],
  ['Workshop', 'workshop-invitation-detail', '/workshop/invitations/seed-invitation-1', 'Invitation details'],
  ['Workshop', 'workshop-orders', '/workshop/orders', 'My orders'],
  ['Workshop', 'workshop-order-detail', '/workshop/orders/order-rework', 'Order details'],
  ['Workshop', 'workshop-profile', '/workshop/profile', 'Workshop profile'],
  ['Workshop', 'workshop-settings', '/workshop/settings', 'Settings'],
  ['Workshop', 'workshop-onboarding', '/workshop/onboarding', 'Workshop onboarding'],
  ['Inspector', 'inspector-dashboard', '/inspector/dashboard', 'Inspector workspace'],
  ['Inspector', 'inspector-assignments', '/inspector/inspections', 'Assigned inspections'],
  ['Inspector', 'inspector-pending-detail', '/inspector/inspections/inspection-qc', 'inspection-qc'],
  ['Inspector', 'inspector-rework-detail', '/inspector/inspections/inspection-rework', 'inspection-rework'],
  ['Inspector', 'inspector-accepted-detail', '/inspector/inspections/inspection-closed', 'inspection-closed'],
  ['Inspector', 'inspector-rework', '/inspector/rework', 'Rework follow-up'],
  ['Inspector', 'inspector-history', '/inspector/history', 'Inspection history'],
  ['Admin', 'admin-dashboard', '/admin/dashboard', 'Admin workspace'],
  ['Admin', 'admin-users', '/admin/users', 'User directory'],
  ['Admin', 'admin-user-detail', '/admin/users/buyer-1', 'Ananya Shah'],
  ['Admin', 'admin-workshops', '/admin/workshops', 'Workshop oversight'],
  ['Admin', 'admin-workshop-detail', '/admin/workshops/workshop-1', 'Sahyadri Precision Works'],
  ['Admin', 'admin-jobs', '/admin/jobs', 'Manufacturing jobs'],
  ['Admin', 'admin-job-detail', '/admin/jobs/job-1', 'Machine aluminium mounting brackets'],
  ['Admin', 'admin-orders', '/admin/orders', 'Manufacturing orders'],
  ['Admin', 'admin-order-detail', '/admin/orders/order-rework', 'order-rework'],
  ['Admin', 'admin-quality', '/admin/quality', 'Quality operations'],
  ['Admin', 'admin-quality-detail', '/admin/quality/inspection-rework', 'inspection-rework'],
];
for (const [role, name, path, title] of screens) test('Phase 9C ' + name + ' responsive evidence and read-only browsing', async ({ page }, info) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page, role!); const before = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  for (const width of [1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(path!);
    await expect(page.getByRole('heading', { level: 1, name: title!, exact: true })).toBeVisible();
    await expect(page.getByText(/^Loading (shared workshop records|assigned inspections|inspection details|platform)/)).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.workspace-heading .kl-page-header').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('main').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter');
    if (width === 1440 || width === 375) await page.screenshot({ path: info.outputPath('phase-9c-' + name + '-' + width + '.png'), fullPage: true });
  }
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(before);
  expect(errors).toEqual([]);
});
for (const role of ['Workshop', 'Inspector', 'Admin']) test('Phase 9C ' + role + ' keyboard mobile navigation and reduced motion', async ({ page }) => {
  await login(page, role); await page.setViewportSize({ width: 375, height: 1000 });
  const trigger = page.getByRole('button', { name: 'Open navigation' }); await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Workspace navigation', exact: true });
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('link', { name: 'Shared foundation' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.locator('.workspace-heading .kl-page-header').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.goto(role === 'Admin' ? '/inspector/dashboard' : '/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible();
});
test('Phase 9C workshop quotation editor validates and cancels without changing shared terms', async ({ page }, info) => {
  await login(page, 'Workshop'); await page.goto('/workshop/invitations/seed-invitation-1');
  const before = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  await page.getByRole('button', { name: 'Edit quote', exact: true }).click();
  await page.getByLabel('Quoted total (INR)', { exact: true }).fill('0'); await page.getByRole('button', { name: 'Review mock quotation' }).click();
  await expect(page.getByLabel('Quoted total (INR)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Quoted total (INR)', { exact: true }).fill('58000');
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.getByLabel('Quoted total (INR)', { exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: info.outputPath('phase-9c-workshop-quote-editor-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Review mock quotation' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Save mock quotation changes?', exact: true });
  await expect(confirmation.getByRole('button', { name: 'Save quotation changes' })).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Cancel quotation' }).click();
  await expect(page.getByRole('form', { name: 'Mock quotation form' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(before);
});
test('Phase 9C inspector draft outcome and immutable history retain independent QC', async ({ page }, info) => {
  await login(page, 'Inspector'); await page.goto('/inspector/inspections/inspection-qc');
  const before = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  await page.getByRole('navigation', { name: 'Inspection sections' }).getByRole('link', { name: 'Record findings' }).click();
  await expect(page.locator('#qc-checklist')).toBeFocused();
  await page.getByLabel('Proposed QC decision').selectOption('REWORK');
  const outcome = page.getByRole('region', { name: 'Proposed QC outcome' });
  await expect(outcome.getByLabel('Rework reason', { exact: true })).toBeVisible();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('phase-9c-inspector-proposed-rework-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Review QC decision' }).click();
  await expect(page.locator('[role=alert][tabindex="-1"]')).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Confirm mock QC decision', exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(before);
  await page.goto('/inspector/inspections/inspection-closed');
  await expect(page.getByText('Submitted records are immutable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review QC decision' })).toHaveCount(0);
});
test('Phase 9C admin directories filter and link to read-only related records', async ({ page }, info) => {
  await login(page, 'Admin'); await page.goto('/admin/workshops');
  const before = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  await page.getByLabel('Capability', { exact: true }).selectOption('Sheet metal fabrication');
  await expect(page.getByRole('status')).toHaveText('1 of 4 records');
  await page.getByText('Compact record summaries', { exact: true }).click();
  const card = page.getByRole('article', { name: 'Vishwakarma Sheet Metal summary', exact: true });
  await expect(card).toContainText('Sheet metal fabrication');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('phase-9c-admin-compact-directory-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('table').getByRole('link', { name: 'Vishwakarma Sheet Metal', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Published workshop profile', exact: true })).toContainText('Laser cutter');
  await expect(page.getByRole('button', { name: /Suspend|Delete|Approve workshop/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(before);
});

test('Phase 9C opportunity response leads to the existing quote creation form without an order', async ({ page }, info) => {
  await login(page, 'Buyer'); await page.goto('/buyer/jobs/job-1/matches');
  const workshop = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true }) });
  await workshop.getByRole('button', { name: 'Invite workshop' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('status')).toContainText('Invitation recorded');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByLabel('Email address').fill('deccan@kaarigarlink.example');
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL('/workshop/dashboard');
  await expect(page.getByRole('group', { name: 'Available invitation responses' })).toContainText('1');
  await page.getByRole('region', { name: 'Workshop opportunity actions' }).getByRole('link', { name: 'Machine aluminium mounting brackets', exact: true }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kaarigarlink.demo-data.v1')!));
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(page.getByText('Mock invitation accepted.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit quote', exact: true }).click();
  await page.getByLabel('Quoted total (INR)', { exact: true }).fill('55000');
  await page.getByLabel('Estimated delivery', { exact: true }).fill('2026-12-13');
  await page.getByLabel('Quotation notes').fill('Proposed machining terms for the demo requirement.');
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: info.outputPath('phase-9c-workshop-quote-create-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Cancel quotation' }).click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('kaarigarlink.demo-data.v1')!));
  expect(after.jobs).toEqual(before.jobs); expect(after.quotes).toEqual(before.quotes);
  await page.goto('/workshop/orders'); await expect(page.getByRole('heading', { name: 'No assigned orders', exact: true })).toBeVisible();
});
