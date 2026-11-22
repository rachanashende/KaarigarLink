import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T08:00:00Z'));
  await page.goto('/login'); await page.getByRole('button', { name: 'Buyer', exact: true }).click();
  await expect(page).toHaveURL('/buyer/dashboard');
});
const routes = [
  ['dashboard', '/buyer/dashboard'], ['jobs', '/buyer/jobs'], ['post-job', '/buyer/jobs/new'],
  ['job-detail', '/buyer/jobs/job-1'], ['matches', '/buyer/jobs/job-1/matches'], ['quotes', '/buyer/jobs/job-1/quotes'],
  ['orders', '/buyer/orders'], ['order-tracking', '/buyer/orders/order-rework'], ['order-review', '/buyer/orders/order-closed/review'],
];
for (const [name, path] of routes) test('Phase 9B ' + name + ' responsive evidence and read-only navigation', async ({ page }, info) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const before = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  for (const width of [1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(path!);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Loading (your|workshop|quotations|order|job|buyer)/)).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.buyer-heading').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('main').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter');
    if (width === 1440 || width === 375) await page.screenshot({ path: info.outputPath('phase-9b-' + name + '-' + width + '.png'), fullPage: true });
  }
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(before);
  expect(errors).toEqual([]);
});
test('Phase 9B pipeline, filters, requirement and comparison keep canonical behavior', async ({ page }, info) => {
  await page.getByRole('region', { name: 'Job status overview' }).getByRole('link', { name: 'Quoting', exact: true }).click();
  await expect(page).toHaveURL('/buyer/jobs?status=QUOTING');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('QUOTING');
  await page.goto('/buyer/jobs/job-1/matches');
  await expect(page.getByRole('region', { name: 'Job requirement summary' })).toContainText('Aluminium 6061');
  await page.goto('/buyer/jobs/job-1/quotes');
  await page.getByRole('checkbox', { name: /Compare quotation quote-1 / }).check();
  await page.getByRole('checkbox', { name: /Compare quotation quote-2 / }).check();
  await expect(page.getByRole('region', { name: 'Selected quotation comparison' })).toContainText('above the lowest selected amount.');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('phase-9b-selected-comparison-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('table').getByRole('row').filter({ hasText: 'Sahyadri Precision Works' }).getByRole('button', { name: 'Review award' }).click();
  await expect(page.getByRole('dialog', { name: 'Review award', exact: true }).getByRole('button', { name: 'Award order' })).toBeDisabled();
});
test('Phase 9B direct post navigation, focus, form guidance and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const menu = page.getByRole('dialog', { name: 'Workspace navigation' });
  await menu.getByRole('link', { name: 'Post Job', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(menu).not.toBeVisible(); await expect(page).toHaveURL('/buyer/jobs/new');
  await page.getByRole('button', { name: 'Post job', exact: true }).click();
  await expect(page.getByLabel('Job title', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Job title', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('navigation', { name: 'Manufacturing brief sections' }).getByRole('link', { name: /Quantity and delivery/ }).click();
  await expect(page.locator('#quantity-delivery')).toBeInViewport();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/buyer/dashboard');
  expect(await page.locator('.buyer-heading').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.getByRole('link', { name: 'Post a Manufacturing Job', exact: true }).focus();
  expect(await page.getByRole('link', { name: 'Post a Manufacturing Job', exact: true }).evaluate(element => getComputedStyle(element).outlineWidth)).not.toBe('0px');
});
