import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const groups: Record<string, string[]> = {
  Public: ['/', '/login', '/foundation', '/not-a-route'],
  Buyer: ['/buyer/dashboard', '/buyer/jobs', '/buyer/jobs/new', '/buyer/jobs/job-1', '/buyer/jobs/job-1/matches', '/buyer/jobs/job-1/quotes', '/buyer/orders', '/buyer/orders/order-rework', '/buyer/orders/order-closed/review'],
  Workshop: ['/workshop/dashboard', '/workshop/invitations', '/workshop/invitations/seed-invitation-1', '/workshop/orders', '/workshop/orders/order-rework', '/workshop/profile', '/workshop/settings', '/workshop/onboarding'],
  Inspector: ['/inspector/dashboard', '/inspector/inspections', '/inspector/inspections/inspection-qc', '/inspector/inspections/inspection-rework', '/inspector/inspections/inspection-closed', '/inspector/rework', '/inspector/history'],
  Admin: ['/admin/dashboard', '/admin/users', '/admin/users/buyer-1', '/admin/workshops', '/admin/workshops/workshop-1', '/admin/jobs', '/admin/jobs/job-1', '/admin/orders', '/admin/orders/order-rework', '/admin/quality', '/admin/quality/inspection-rework'],
};

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00Z')); });
async function login(page: Page, role: string) {
  await page.goto('/login'); await page.getByRole('button', { name: role, exact: true }).click();
  await expect(page).toHaveURL('/' + role.toLowerCase() + '/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/^Loading /)).toHaveCount(0);
}
async function accessibility(page: Page, info: TestInfo, label: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const audit = await new AxeBuilder({ page }).analyze();
  const result = {
    violations: audit.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })),
    incomplete: audit.incomplete.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })),
  };
  await info.attach(label, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  if (result.violations.length) await page.screenshot({ path: info.outputPath(label + '-problem.png'), fullPage: true });
  expect(result.violations, label).toEqual([]);
}

for (const [role, paths] of Object.entries(groups)) test('Phase 9D ' + role + ' route accessibility and five-width audit', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  if (role !== 'Public') await login(page, role); else await page.goto('/');
  const before = await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'));
  for (const path of paths) {
    await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await info.attach(path.replaceAll('/', '-') + '-semantics', { body: await page.locator('body').ariaSnapshot(), contentType: 'text/plain' });
    await expect(page.getByText(/^Loading (KaarigarLink|page|shared workshop records|assigned inspections|inspection details|platform|your)/)).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path + ' at ' + width).toBe(true);
      expect(await page.evaluate(() => Array.from(document.images).filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src)), path).toEqual([]);
      if (width === 1440 || width === 320) await accessibility(page, info, path.replaceAll('/', '-') + '-' + width);
    }
  }
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBe(before);
  expect(errors).toEqual([]);
});

test('Phase 9D dialogs, validation, empty states and denied routes stay accessible', async ({ page }, info) => {
  test.slow(); await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/login'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Email address')).toBeFocused(); await accessibility(page, info, 'invalid-login');
  await login(page, 'Buyer');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation', exact: true })).toBeVisible();
  await accessibility(page, info, 'mobile-navigation'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Log out of KaarigarLink?', exact: true })).toBeVisible();
  await accessibility(page, info, 'logout-confirmation'); await page.keyboard.press('Escape');
  await page.goto('/buyer/jobs?q=no-such-manufacturing-part');
  await expect(page.getByRole('heading', { name: 'No jobs match these filters' })).toBeVisible();
  await accessibility(page, info, 'empty-jobs');
  await page.goto('/admin/users'); await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await accessibility(page, info, 'denied-route');
});

test('Phase 9D local fonts and images load without failed resource requests', async ({ page }, info) => {
  const failures: string[] = [];
  page.on('requestfailed', request => failures.push(request.url()));
  const responses: { url: string; status: number }[] = [];
  page.on('response', response => { if (response.status() >= 400) responses.push({ url: response.url(), status: response.status() }); });
  await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 16px Inter'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('500 11px "Geist Mono"'))).toBe(true);
  await login(page, 'Buyer'); await page.evaluate(() => document.fonts.ready);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name, size: (entry as PerformanceResourceTiming).encodedBodySize })));
  expect(resources.filter(entry => entry.name.includes('.woff2')).every(entry => new URL(entry.name).origin === new URL(page.url()).origin)).toBe(true);
  expect(failures).toEqual([]); expect(responses).toEqual([]);
  await info.attach('resource-loading', { body: JSON.stringify(resources, null, 2), contentType: 'application/json' });
});

test('Phase 9D foundation scope link transfers keyboard focus to its destination', async ({ page }, info) => {
  await page.goto('/foundation');
  const link = page.getByRole('link', { name: 'View foundation scope', exact: true });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#foundation')).toBeFocused();
  if (info.project.name === 'chromium') for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath('phase-9d-foundation-focus-' + width + '.png'), fullPage: true });
  }
});

test('Phase 9D sidebar speech label matches the visible action', async ({ page }, info) => {
  await login(page, 'Buyer'); await page.setViewportSize({ width: 1440, height: 1000 });
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
  await expect(collapse).toHaveText('Collapse sidebar');
  await collapse.focus();
  if (info.project.name === 'chromium') await page.locator('aside.kl-sidebar').screenshot({ path: info.outputPath('phase-9d-sidebar-label-1440.png') });
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(collapse).toHaveText('Collapse sidebar');
});

test('Phase 9D pointer-opened dialogs restore focus to their actual opener', async ({ page }, info) => {
  await login(page, 'Buyer'); await page.setViewportSize({ width: 375, height: 1000 });
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.click(); await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
  if (info.project.name === 'chromium') await page.screenshot({ path: info.outputPath('phase-9d-dialog-return-focus-375.png') });
  const logout = page.getByRole('button', { name: 'Log out', exact: true });
  await logout.click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(logout).toBeFocused();
});

test('Phase 9D skip links are the first keyboard stop in every engine', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  for (const path of ['/', '/login', '/foundation']) {
    await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
    if (path === '/login' && info.project.name === 'chromium') await page.screenshot({ path: info.outputPath('phase-9d-login-skip-focus-320.png') });
    await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
  }
});

for (const [name, path] of [['public', '/'], ['foundation', '/foundation']] as const) test('Phase 9D ' + name + ' editorial heading keeps complete words at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 1000 }); await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  const word = await page.getByRole('heading', { level: 1 }).evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const start = node.textContent?.indexOf('manufacturing') ?? -1;
      if (start >= 0) {
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 'manufacturing'.length);
        return { text: range.toString(), lines: range.getClientRects().length };
      }
      node = walker.nextNode();
    }
    throw new Error('The expected heading word is missing.');
  });
  expect(word).toEqual({ text: 'manufacturing', lines: 1 });
  if (name === 'public' && info.project.name === 'chromium') await page.screenshot({ path: info.outputPath('phase-9d-public-heading-320.png') });
});
