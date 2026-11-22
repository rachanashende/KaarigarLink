import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00Z')); });

test('public homepage, capability anchors, honest boundaries and anonymous guards', async ({ page }) => {
  await page.goto('/'); await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Where manufacturing meets opportunity.', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('kaarigarlink.mock-session.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('kaarigarlink.demo-data.v1'))).toBeNull();
  await expect(page.getByRole('complementary', { name: 'Current demo availability' })).toContainText('not yet enabled');
  await expect(page.getByText('Admin', { exact: true })).toHaveCount(0);
  for (const [label, id] of [['How It Works', 'how-it-works'], ['Capabilities', 'capabilities'], ['Why KaarigarLink', 'why-kaarigarlink']]) {
    await page.getByRole('navigation', { name: 'Public navigation', exact: true }).getByRole('link', { name: label!, exact: true }).click();
    await expect(page).toHaveURL(new RegExp('#' + id + '$'));
    await expect(page.locator('#' + id)).toBeInViewport();
  }
  for (const role of ['buyer', 'workshop', 'inspector', 'admin']) { await page.goto('/' + role + '/dashboard'); await expect(page).toHaveURL('/login'); }
});

for (const [cta, role] of [['Find a Workshop', 'Buyer'], ['Join as a Workshop', 'Workshop']]) {
  test(cta + ' enters through login and the selected role', async ({ page }) => {
    await page.goto('/'); await page.getByRole('link', { name: cta!, exact: true }).first().click();
    await expect(page).toHaveURL('/login');
    expect(await page.evaluate(() => sessionStorage.getItem('kaarigarlink.mock-session.v1'))).toBeNull();
    await page.getByRole('button', { name: role!, exact: true }).click();
    await expect(page).toHaveURL('/' + role!.toLowerCase() + '/dashboard');
  });
}
for (const [role, deepLink] of [
  ['Buyer', '/buyer/jobs/job-1'], ['Workshop', '/workshop/invitations/seed-invitation-1'],
  ['Inspector', '/inspector/inspections/inspection-qc'], ['Admin', '/admin/workshops/workshop-1'],
]) {
  test(role + ' restoration, root/login redirects and deep links are preserved', async ({ page }) => {
    await page.goto('/'); await page.getByRole('banner').getByRole('link', { name: 'Log In', exact: true }).click();
    await page.getByRole('button', { name: role!, exact: true }).click();
    const dashboard = '/' + role!.toLowerCase() + '/dashboard'; await expect(page).toHaveURL(dashboard);
    await page.goto('/'); await expect(page).toHaveURL(dashboard);
    await page.goto('/login'); await expect(page).toHaveURL(dashboard);
    await page.goto(deepLink!); await page.reload(); await expect(page).toHaveURL(deepLink!);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^(Access restricted|Invitation unavailable)$/ })).toHaveCount(0);
    await page.goto(role === 'Admin' ? '/buyer/dashboard' : '/admin/dashboard');
    await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible();
  });
}

test('public mobile navigation preserves keyboard focus, anchors and responsive state', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/');
  // Raw key events do not auto-wait for the SPA to finish mounting.
  await expect(page.getByRole('heading', { name: 'Where manufacturing meets opportunity.', exact: true })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
  const trigger = page.getByRole('button', { name: 'Open public navigation' }); await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'KaarigarLink navigation', exact: true });
  await expect(dialog.getByRole('button', { name: 'Close public navigation' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('link', { name: 'Get Started', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Close public navigation' })).toBeFocused();
  await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: testInfo.outputPath('phase-9a5-mobile-navigation.png') });
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('link', { name: 'Capabilities', exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(page.locator('#capabilities')).toBeFocused();
  await expect(page.locator('#capabilities')).toBeInViewport();
  await trigger.click(); await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(dialog).not.toBeVisible(); await expect(page.getByRole('button', { name: 'Open public navigation', includeHidden: true })).toHaveAttribute('aria-expanded', 'false');
});

test('public landing is readable at all target widths with local fonts and reduced motion', async ({ page }, testInfo) => {
  test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.public-hero-actions').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.getByRole('heading', { level: 1 }).evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter');
    if ([1440, 768, 390].includes(width)) {
      await page.screenshot({ path: testInfo.outputPath('phase-9a5-home-' + width + '.png'), fullPage: true });
      await page.screenshot({ path: testInfo.outputPath('phase-9a5-hero-' + width + '.png') });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  expect(await page.locator('.public-hero-title').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.locator('#why-kaarigarlink').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Quality has an independent voice.', exact: true })).toBeVisible();
  expect(await page.locator('#why-kaarigarlink').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.goto('/login'); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('phase-9a5-login-320.png'), fullPage: true });
  await page.getByRole('link', { name: 'KaarigarLink home', exact: true }).click(); await expect(page).toHaveURL('/');
  expect(errors).toEqual([]);
});
