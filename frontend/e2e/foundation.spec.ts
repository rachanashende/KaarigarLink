import { expect, test } from '@playwright/test';
test('foundation renders without horizontal overflow and supports keyboard access', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/foundation');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440 || width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`foundation-${width}.png`), fullPage: true });
    }
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  expect(errors).toEqual([]);
});
test('/ and /foundation: entry points, refresh, menu item and round trips to the role workspaces', async ({ page }) => {
  // Signed out: / goes to sign-in; /foundation is the public platform guide.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/foundation');
  await expect(page.getByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Phase 0|will follow|reserved/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);

  for (const [role, landing, shortcut, target] of [
    ['Buyer', '/buyer/dashboard', 'Manufacturing orders', '/buyer/orders'],
    ['Workshop', '/workshop/dashboard', 'Invitations', '/workshop/invitations'],
    ['Inspector', '/inspector/dashboard', 'Assigned inspections', '/inspector/inspections'],
    ['Admin', '/admin/dashboard', 'Audit history', '/admin/audit'],
  ] as const) {
    await page.goto('/login');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/login');
    await page.getByRole('button', { name: 'Demo ' + role, exact: true }).click();
    await expect(page).toHaveURL(landing);
    // Signed in: / opens the role workspace, never the guide.
    await page.goto('/');
    await expect(page).toHaveURL(landing);

    // Menu item -> guide inside the shell (menu and breadcrumb stay), survives refresh.
    const menu = page.getByRole('navigation', { name: 'Workspace navigation' });
    await menu.getByRole('link', { name: 'Platform guide' }).click();
    await expect(page).toHaveURL('/foundation');
    await expect(page.getByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Platform guide' })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
    await expect(menu).toBeVisible();

    // Shortcut to a role page, then back, then to the dashboard.
    await page.getByRole('navigation', { name: role + ' shortcuts' }).getByRole('link', { name: shortcut, exact: true }).click();
    await expect(page).toHaveURL(target);
    await menu.getByRole('link', { name: 'Platform guide' }).click();
    await page.getByRole('link', { name: 'Go to my workspace' }).click();
    await expect(page).toHaveURL(landing);
  }

  // Role protection is unchanged (the admin from the last loop cannot open buyer pages).
  await page.goto('/buyer/orders');
  await expect(page.getByRole('heading', { level: 1, name: 'Access restricted' })).toBeVisible();
});
