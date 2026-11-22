import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00.000Z')); });

const pages = [
  ['dashboard', 'Workshop workspace'],
  ['invitations', 'Invitations'],
  ['invitations/KL-2841', 'Invitation details'],
  ['orders', 'My orders'],
  ['orders/order-production', 'Order details'],
  ['profile', 'Workshop profile'],
  ['settings', 'Settings'],
  ['onboarding', 'Workshop onboarding'],
] as const;
const legacyKeys = ['kaarigarlink-workshop-data-v1', 'kaarigarlink-demo-quotes-v1', 'kaarigarlink-demo-onboarding-v1'];

test('shared workshop login, canonical routing, disabled actions and isolated legacy storage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(keys => {
    for (const key of keys) localStorage.setItem(key, 'corrupt standalone private data');
    sessionStorage.setItem('kaarigarlink-demo-workshop-session', 'active');
  }, legacyKeys);
  await page.goto('/workshop/onboarding');
  await expect(page).toHaveURL('/login');
  await page.getByRole('button', { name: 'Demo Workshop', exact: true }).click();
  await expect(page).toHaveURL('/workshop/dashboard');
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'));
  for (const [path, title] of pages) {
    await page.goto('/workshop/' + path);
    await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Workshop integration status' })).toContainText('Ravi Patil');
    await expect(page.getByRole('status')).toHaveCount(0);
    for (const button of await page.getByRole('main').getByRole('button').all()) {
      const allowed = await button.evaluate(element => ['Edit quote', 'Withdraw quote'].includes(element.textContent ?? '') && [...(element.closest('tr')?.querySelectorAll('td') ?? [])].some(cell => cell.textContent === 'quote-1'));
      if (allowed) await expect(button).toBeEnabled(); else await expect(button).toBeDisabled();
    }
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'))).toBe(primary);
  }
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), legacyKeys)).toEqual(legacyKeys.map(() => 'corrupt standalone private data'));
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBeNull();
  await page.goto('/workshop');
  await expect(page).toHaveURL('/workshop/dashboard');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
  await page.goto('/workshop/orders');
  await expect(page).toHaveURL('/login');
  expect(errors).toEqual([]);
});

for (const role of ['Buyer', 'Inspector', 'Admin']) {
  test(role + ' cannot access any workshop workspace or details', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Demo ' + role, exact: true }).click();
    for (const [path] of pages) {
      await page.goto('/workshop/' + path);
      await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Workshop integration status' })).toHaveCount(0);
    }
  });
}

test('workshop navigation supports keyboard, mobile, collapse and shared styling', async ({ page }, testInfo) => {
  test.slow();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Demo Workshop', exact: true }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title] of pages) {
      await page.goto('/workshop/' + path);
      await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      if (['dashboard', 'invitations'].includes(path) && [1440, 390].includes(width)) await page.screenshot({ path: testInfo.outputPath('phase-8b1-' + path + '-' + width + '.png'), fullPage: true });
    }
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Workspace navigation' });
  const mobileLink = dialog.getByRole('link', { name: 'Invitations', exact: true });
  await mobileLink.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/workshop/invitations');
  await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const link = page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Workshop profile', exact: true });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/workshop/profile');
});
