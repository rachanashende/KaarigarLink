import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Buyer', exact: true }).click();
  await expect(page).toHaveURL('/buyer/dashboard');
}
test('orders search/filter, keyboard navigation and read-only rework tracking', async ({ page }) => {
  await login(page);
  await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Manufacturing orders' }).click();
  await expect(page.getByRole('status')).toHaveText('6 of 6 orders');
  await page.getByLabel('Search orders, jobs or workshops').fill('impeller');
  await expect(page.getByRole('status')).toHaveText('1 of 6 orders');
  await page.getByLabel('Order status', { exact: true }).selectOption('CLOSED');
  await expect(page.getByRole('heading', { name: 'No orders match these filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('status')).toHaveText('6 of 6 orders');
  await page.getByLabel('Sort orders').selectOption('deadline');
  const link = page.getByRole('table').getByRole('link', { name: 'order-rework', exact: true });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/buyer/orders/order-rework');
  await expect(page.getByRole('heading', { name: 'order-rework', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50');
  await expect(page.getByText('Rework deadline: 26 Nov 2026')).toBeVisible();
  await expect(page.getByText(/Bore surface finish exceeds/)).toBeVisible();
  await expect(page.getByLabel('Written feedback')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Accept QC|Update milestone/ })).toHaveCount(0);
});
test('review validation, keyboard confirmation, duplicate prevention, reload persistence and reset', async ({ page }) => {
  await login(page);
  await page.goto('/buyer/orders/order-closed/review');
  await page.getByRole('button', { name: 'Review submission' }).click();
  await expect(page.getByLabel('Workshop rating')).toBeFocused();
  await expect(page.getByText('Choose a workshop rating.')).toBeVisible();
  await page.getByLabel('Workshop rating').selectOption('5');
  await page.getByLabel('Written feedback').fill('Accurate machining, careful packing and clear updates.');
  await page.getByRole('button', { name: 'Review submission' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit demo review?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Submit demo review' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Review submission' })).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Submit demo review' }).dblclick();
  await expect(page.getByRole('status')).toContainText('Demo review recorded');
  await expect(page.getByText('Your rating: 5 / 5')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your rating: 5 / 5')).toBeVisible();
  await expect(page.getByLabel('Written feedback')).toHaveCount(0);
  const raw = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  expect(JSON.parse(raw!).reviews).toHaveLength(1);
  expect(raw).not.toContain('DemoPass'); expect(raw).not.toContain('password'); expect(raw).not.toContain('token');
  await page.goto('/buyer/orders/order-paid');
  await expect(page.getByText(/Payment status alone does not qualify/)).toBeVisible();
  await page.goto('/buyer/orders');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'order-closed', exact: true }).click();
  await expect(page.getByLabel('Written feedback')).toBeVisible();
});
test('invitation and job persistence survive reload without persisting attachment metadata', async ({ page }) => {
  await login(page);
  await page.goto('/buyer/jobs/job-1/matches');
  const workshop = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true }) });
  await workshop.getByRole('button', { name: 'Invite workshop' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send invitation' }).click();
  await expect(workshop.getByText('Invitation: Pending')).toBeVisible();
  await page.reload();
  await expect(workshop.getByText('Invitation: Pending')).toBeVisible();
  await page.goto('/buyer/jobs/new');
  for (const [label, value] of [['Job title', 'Phase 4 reload sample'], ['Manufacturing capability', 'Milling'], ['Job description', 'Synthetic production requirement.'], ['Material', 'Aluminium'], ['Required machinery or capabilities', 'Milling'], ['Quantity', '20'], ['Delivery deadline', '2099-01-01'], ['Delivery city', 'Pune'], ['State or union territory', 'Maharashtra']]) await page.getByLabel(label!, { exact: true }).fill(value!);
  await page.getByLabel('Design files', { exact: false }).setInputFiles({ name: 'sensitive-demo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic-only') });
  await page.getByRole('button', { name: 'Post job', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Phase 4 reload sample' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Phase 4 reload sample' })).toBeVisible();
  await expect(page.getByText('No design files attached.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).not.toContain('sensitive-demo.pdf');
});
test('unknown orders, role restrictions and invalid persistence remain explicit', async ({ page }) => {
  await login(page);
  await page.goto('/buyer/orders/missing');
  await expect(page.getByRole('heading', { name: 'Order unavailable' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('kaarigarlink.demo-data.v1', '{"version":99}'));
  await page.goto('/buyer/orders');
  await expect(page.getByRole('alert')).toContainText('could not be restored');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Workshop', exact: true }).click();
  for (const route of ['/buyer/orders', '/buyer/orders/order-production', '/buyer/orders/order-closed/review']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  }
});
test('orders, timeline and review fit all breakpoints with accessible mobile navigation', async ({ page }, testInfo) => {
  test.slow();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, label] of [['/buyer/orders', 'orders'], ['/buyer/orders/order-rework', 'rework'], ['/buyer/orders/order-closed/review', 'review']]) {
      await page.goto(route!);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (label === 'orders') await expect(page.getByRole('table')).toBeVisible();
      if (label === 'rework') await expect(page.getByRole('heading', { name: 'Production milestones' })).toBeVisible();
      if (label === 'review') await expect(page.getByLabel('Written feedback')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath('phase-4-' + label + '-' + width + '.png'), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Mobile workspace navigation' });
  await nav.getByRole('link', { name: 'Manufacturing orders' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const region = page.getByRole('region', { name: 'Buyer manufacturing orders', exact: true });
  await region.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
