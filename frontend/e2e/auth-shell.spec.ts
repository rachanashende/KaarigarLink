import { expect, test } from '@playwright/test';

const roleNames = { buyer: 'Buyer', workshop: 'Workshop', inspector: 'Inspector', admin: 'Admin' } as const;

test('login validation, password visibility and email login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeFocused();
  await page.getByLabel('Email address').fill('buyer@kaarigarlink.example');
  await page.getByLabel('Password', { exact: true }).fill('wrong-pass');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await page.getByLabel('Password', { exact: true }).fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/buyer/dashboard');
});

for (const [role, name] of Object.entries(roleNames)) {
  test(`${name} demo routing, restoration, guards and logout`, async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL('/' + role + '/dashboard');
    await expect(page.getByRole('heading', { name: name + ' workspace', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: name + ' workspace', exact: true })).toBeVisible();
    await page.goto('/login');
    await expect(page).toHaveURL('/' + role + '/dashboard');
    const other = role === 'admin' ? 'buyer' : 'admin';
    await page.goto('/' + other + '/dashboard');
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await page.getByRole('link', { name: 'Return to my workspace' }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Log out of KaarigarLink?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await dialog.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await page.goto('/' + role + '/dashboard');
    await expect(page).toHaveURL('/login');
  });
}

test('desktop collapse and responsive shell screenshots', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Buyer', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440 || width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`phase-1-buyer-${width}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('mobile navigation traps focus, closes on Escape and restores focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Buyer', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const dialog = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: 'Shared foundation' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('phase-1-mobile-navigation.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('link', { name: 'Buyer overview' }).click();
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(dialog).not.toBeVisible();
});

test('login layout and keyboard skip link', async ({ page }, testInfo) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    if (width !== 320) await page.screenshot({ path: testInfo.outputPath(`phase-1-login-${width}.png`), fullPage: true });
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('expired or corrupt sessions cannot enter protected routes', async ({ page }) => {
  await page.goto('/login');
  for (const saved of ['invalid-json', JSON.stringify({ version: 1, userId: 'admin-1', expiresAt: 0 })]) {
    await page.evaluate(raw => sessionStorage.setItem('kaarigarlink.mock-session.v1', raw), saved);
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL('/login');
    expect(await page.evaluate(() => sessionStorage.getItem('kaarigarlink.mock-session.v1'))).toBeNull();
  }
});

test('captures remaining role placeholders without operational actions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [role, name] of Object.entries(roleNames).filter(([role]) => role !== 'buyer')) {
    await page.goto('/login');
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL('/' + role + '/dashboard');
    await page.screenshot({ path: testInfo.outputPath(`phase-1-${role}-1440.png`), fullPage: true });
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL('/login');
  }
});
