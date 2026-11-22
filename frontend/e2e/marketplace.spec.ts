import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Demo Buyer', exact: true }).click();
  await expect(page).toHaveURL('/buyer/dashboard');
}

test('ranked explanations, profile details, confirmation and duplicate-safe invitation', async ({ page }) => {
  await login(page);
  await page.goto('/buyer/jobs/job-1');
  await page.getByRole('navigation', { name: 'Job workspace' }).getByRole('link', { name: 'Workshop matches', exact: true }).click();
  const first = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Sahyadri Precision Works', exact: true }) });
  await expect(first.getByText('92', { exact: true })).toBeVisible();
  await expect(first.getByText('CNC machining capability is listed.')).toBeVisible();
  await first.getByRole('button', { name: 'View workshop details' }).click();
  const profile = page.getByRole('dialog', { name: 'Sahyadri Precision Works', exact: true });
  await expect(profile.getByText('3-axis CNC mill', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  const deccan = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true }) });
  await deccan.getByRole('button', { name: 'Invite workshop' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite this workshop?' });
  await expect(dialog).toContainText('Deccan Toolcraft');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(deccan.getByRole('button', { name: 'Invite workshop' })).toBeFocused();
  await deccan.getByRole('button', { name: 'Invite workshop' }).click();
  await dialog.getByRole('button', { name: 'Send invitation' }).dblclick();
  await expect(page.getByRole('status')).toContainText('Invitation recorded for Deccan Toolcraft. Status: Pending.');
  await expect(deccan.getByRole('button', { name: 'Invite workshop' })).toBeDisabled();
  await page.getByRole('navigation', { name: 'Job workspace' }).getByRole('link', { name: 'Job brief', exact: true }).click();
  await page.getByRole('navigation', { name: 'Job workspace' }).getByRole('link', { name: 'Workshop matches', exact: true }).click();
  await expect(deccan.getByText('Invitation: Pending')).toBeVisible();
});

test('quotations compare, sort and inspect without creating an unsupported order', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto('/buyer/jobs/job-1/quotes');
  const table = page.getByRole('table', { name: 'Job quotations' });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByText('₹1,18,000.00')).not.toBeVisible();
  await page.getByRole('checkbox', { name: /Compare quotation quote-1 / }).check();
  await page.getByRole('checkbox', { name: /Compare quotation quote-2 / }).check();
  await expect(page.getByRole('heading', { name: 'Selected quotation comparison' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('phase-3-comparison-1440.png'), fullPage: true });
  await page.getByLabel('Sort quotations').selectOption('amount-desc');
  await expect(table.getByRole('row').nth(1)).toContainText('Sahyadri Precision Works');
  await page.getByLabel('Sort quotations').selectOption('delivery');
  await expect(table.getByRole('row').nth(1)).toContainText('Vishwakarma Sheet Metal');
  const rejected = table.getByRole('row').filter({ hasText: 'Vishwakarma Sheet Metal' });
  await expect(rejected.getByRole('button', { name: 'Review award' })).toBeDisabled();
  const quote = table.getByRole('row').filter({ hasText: 'Sahyadri Precision Works' });
  await quote.getByRole('button', { name: 'View quote' }).click();
  const details = page.getByRole('dialog', { name: 'Quotation details' });
  await expect(details).toContainText('Delivery to Mumbai included.');
  await page.keyboard.press('Escape');
  await quote.getByRole('button', { name: 'Review award' }).click();
  const award = page.getByRole('dialog', { name: 'Review award', exact: true });
  await expect(award).toContainText('Sahyadri Precision Works');
  await expect(award).toContainText('₹58,000.00');
  await expect(award).toContainText('12 Dec 2026');
  await expect(award).toContainText('no order will be created');
  await expect(award.getByRole('button', { name: 'Award order' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('phase-3-award-review.png') });
  await page.keyboard.press('Escape');
  await expect(quote.getByRole('button', { name: 'Review award' })).toBeFocused();
  await page.getByRole('navigation', { name: 'Job workspace' }).getByRole('link', { name: 'Job brief' }).click();
  await expect(page.getByText('Posted', { exact: true })).toBeVisible();
});

test('empty matches, zero/one quotations and unavailable jobs stay truthful', async ({ page }) => {
  await login(page);
  await page.goto('/buyer/jobs/job-3/matches');
  await expect(page.getByRole('heading', { name: 'No eligible workshop matches' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite workshop' })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Job workspace' }).getByRole('link', { name: 'Quotations' }).click();
  await expect(page.getByRole('heading', { name: 'No quotations yet' })).toBeVisible();
  await page.goto('/buyer/jobs/job-2/quotes');
  await expect(page.getByRole('table', { name: 'Job quotations' }).getByRole('row')).toHaveCount(2);
  await page.goto('/buyer/jobs/missing/matches');
  await expect(page.getByRole('alert')).toContainText('unavailable');
});

test('other roles cannot access matching or quote actions', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Demo Workshop', exact: true }).click();
  for (const route of ['/buyer/jobs/job-1/matches', '/buyer/jobs/job-1/quotes']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite workshop' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review award' })).toHaveCount(0);
  }
});

test('matching, quotes and comparison fit mobile/tablet/desktop with keyboard dialogs', async ({ page }, testInfo) => {
  test.slow(); // Multiple viewport navigations and full-page captures share this test budget.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [suffix, label] of [['matches', 'matches'], ['quotes', 'quotes']]) {
      await page.goto('/buyer/jobs/job-1/' + suffix);
      if (suffix === 'matches') await expect(page.getByRole('heading', { name: 'Deccan Toolcraft', exact: true })).toBeVisible();
      else await expect(page.getByRole('table', { name: 'Job quotations' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`phase-3-${label}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/buyer/jobs/job-1/quotes');
  const checkbox = page.getByRole('checkbox', { name: /Compare quotation quote-1 / });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await page.getByRole('checkbox', { name: /Compare quotation quote-2 / }).check();
  await expect(page.getByRole('heading', { name: 'Selected quotation comparison' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('phase-3-comparison-390.png'), fullPage: true });
  const table = page.getByRole('region', { name: 'Job quotations', exact: true });
  await table.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const review = page.getByRole('article', { name: 'Compare Sahyadri Precision Works' }).getByRole('button', { name: 'Review award' });
  await review.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Review award', exact: true });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(review).toBeFocused();
  expect(errors).toEqual([]);
});
