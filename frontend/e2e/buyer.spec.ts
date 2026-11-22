import { expect, test, type Page } from '@playwright/test';

async function buyerLogin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Demo Buyer', exact: true }).click();
  await expect(page).toHaveURL('/buyer/dashboard');
  await expect(page.getByRole('group', { name: 'Total posted jobs' })).toContainText('10');
}
async function fillJob(page: Page) {
  await page.getByLabel('Job title', { exact: true }).fill('Phase 2 precision pump spacers');
  await page.getByLabel('Manufacturing capability', { exact: true }).fill('CNC turning');
  await page.getByLabel('Job description', { exact: true }).fill('Turn spacers for an agricultural pump assembly.');
  await page.getByLabel('Material', { exact: true }).fill('Brass IS 319');
  await page.getByLabel('Required machinery or capabilities', { exact: true }).fill('CNC lathe, bore finishing');
  await page.getByLabel('Quantity', { exact: true }).fill('150');
  await page.getByLabel('Delivery deadline', { exact: true }).fill('2099-01-01');
  await page.getByLabel('Delivery city', { exact: true }).fill('Pune');
  await page.getByLabel('State or union territory', { exact: true }).fill('Maharashtra');
}

test('posts a job once, records file metadata, navigates and refreshes shared dashboard/list data', async ({ page }) => {
  await buyerLogin(page);
  await page.getByRole('link', { name: 'Post a job', exact: true }).click();
  await fillJob(page);
  await page.getByLabel('Budget (INR)', { exact: false }).fill('75000.50');
  await page.getByLabel('Design files', { exact: false }).setInputFiles({ name: 'spacer-drawing.pdf', mimeType: 'application/pdf', buffer: Buffer.from('demo-content-not-to-be-stored') });
  await page.getByRole('button', { name: 'Post job', exact: true }).dblclick();
  await expect(page).toHaveURL(/\/buyer\/jobs\/job-/);
  await expect(page.getByRole('heading', { name: 'Phase 2 precision pump spacers' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Job posted successfully');
  await expect(page.getByText('spacer-drawing.pdf')).toBeVisible();
  await expect(page.getByText('₹75,000.50')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('demo-content-not-to-be-stored');
  await page.getByRole('button', { name: 'Dismiss success notification' }).click();
  await expect(page.getByText('Job posted successfully.')).not.toBeVisible();
  await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Buyer overview' }).click();
  await expect(page.getByRole('group', { name: 'Total posted jobs' })).toContainText('11');
  await expect(page.getByRole('group', { name: 'Active jobs' })).toContainText('9');
  await expect(page.getByRole('table').getByRole('link', { name: 'Phase 2 precision pump spacers' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Manufacturing jobs' }).click();
  await expect(page.getByRole('status')).toHaveText('11 of 11 jobs');
  await page.getByLabel('Search job titles').fill('precision pump spacers');
  await expect(page.getByRole('status')).toHaveText('1 of 11 jobs');
});

test('accessible required and numeric/date validation does not create a job', async ({ page }) => {
  await buyerLogin(page);
  await page.getByRole('link', { name: 'Post a job', exact: true }).click();
  await page.getByRole('button', { name: 'Post job', exact: true }).click();
  await expect(page.getByLabel('Job title', { exact: true })).toBeFocused();
  await expect(page.getByText('Job title is required.')).toBeVisible();
  await fillJob(page);
  await page.getByLabel('Quantity', { exact: true }).fill('0');
  await page.getByLabel('Budget (INR)', { exact: false }).fill('-1');
  await page.getByLabel('Delivery deadline', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Post job', exact: true }).click();
  await expect(page.getByText('Quantity must be greater than 0.')).toBeVisible();
  await expect(page.getByText('Budget must be greater than 0.')).toBeVisible();
  await expect(page.getByText('Delivery deadline must be a future date (India time).')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL('/buyer/jobs');
  await expect(page.getByRole('status')).toHaveText('10 of 10 jobs');
});

test('search, status filtering, sorting and row navigation work', async ({ page }) => {
  await buyerLogin(page);
  await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Manufacturing jobs' }).click();
  await page.getByLabel('Search job titles').fill('BRASS');
  await expect(page.getByRole('status')).toHaveText('1 of 10 jobs');
  await page.getByLabel('Status', { exact: true }).selectOption('QUOTING');
  await expect(page.getByRole('heading', { name: 'No jobs match these filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('status')).toHaveText('10 of 10 jobs');
  await page.getByLabel('Sort jobs').selectOption('oldest');
  await expect(page.getByRole('table').getByRole('row').nth(1).getByRole('link')).toContainText('aluminium');
  await page.getByLabel('Sort jobs').selectOption('deadline');
  await expect(page.getByRole('table').getByRole('row').nth(1).getByRole('link')).toContainText('drive shafts');
  await page.getByRole('cell', { name: '500 pieces', exact: true }).click();
  await expect(page).toHaveURL('/buyer/jobs/job-3');
  await expect(page.getByRole('heading', { name: 'Turn brass bushings for pump assemblies' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Jobs', exact: true }).click();
  await expect(page).toHaveURL('/buyer/jobs');
});

test('unknown job and other-role access are handled without operational actions', async ({ page }) => {
  await buyerLogin(page);
  await page.goto('/buyer/jobs/missing');
  await expect(page.getByRole('heading', { name: 'Job unavailable' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to jobs' }).click();
  await expect(page).toHaveURL('/buyer/jobs');
  for (const role of ['Workshop', 'Inspector', 'Admin']) {
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByRole('button', { name: 'Demo ' + role, exact: true }).click();
    await page.goto('/buyer/jobs/new');
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Post job', exact: true })).not.toBeVisible();
  }
});

test('buyer screens fit desktop, tablet and mobile and have keyboard links', async ({ page }, testInfo) => {
  test.slow(); // Twenty viewport/page combinations and screenshots need a larger overall budget.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await buyerLogin(page);
  for (const [route, name] of [['/buyer/dashboard', 'dashboard'], ['/buyer/jobs', 'jobs'], ['/buyer/jobs/new', 'post-job'], ['/buyer/jobs/job-1', 'job-detail']]) {
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route!);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (name === 'dashboard') await expect(page.getByRole('group', { name: 'Total posted jobs' })).toBeVisible();
      if (name === 'jobs') await expect(page.getByRole('table')).toBeVisible();
      if (name === 'job-detail') await expect(page.getByRole('heading', { name: 'Machine aluminium mounting brackets' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`phase-2-${name}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/buyer/jobs');
  const tableRegion = page.getByRole('region', { name: 'Manufacturing jobs', exact: true });
  await tableRegion.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => tableRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/buyer/jobs');
  const link = page.getByRole('table').getByRole('link', { name: /brass bushings/ });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/buyer/jobs/job-3');
  expect(errors).toEqual([]);
});
