import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-19T08:00:00Z')); });
for (const role of ['Buyer', 'Workshop', 'Inspector', 'Admin']) {
  test('Phase 9A ' + role + ' shell, font load and responsive evidence', async ({ page }, testInfo) => {
    test.slow(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/login'); await page.getByRole('button', { name: role, exact: true }).click();
    await expect(page).toHaveURL('/' + role.toLowerCase() + '/dashboard');
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Loading shared workshop records...', { exact: true })).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.evaluate(() => [...document.fonts].some(face => face.family === 'Inter' && face.status === 'loaded'))).toBe(true);
      const main = page.getByRole('main');
      const values = await page.locator('[role=group] .kl-stat-value').evaluateAll(elements => elements.map(element => ({ row: Math.round(element.parentElement!.getBoundingClientRect().top), value: element.getBoundingClientRect().top })));
      for (const row of new Set(values.map(value => value.row))) { const positions = values.filter(value => value.row === row).map(value => value.value); expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1); }
      expect(await main.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter');
      if ([1440, 768, 390].includes(width)) await page.screenshot({ path: testInfo.outputPath('phase-9a-' + role.toLowerCase() + '-' + width + '.png'), fullPage: true });
      if (width < 768) {
        await page.getByRole('button', { name: 'Open navigation' }).click();
        const navigation = page.getByRole('dialog', { name: 'Workspace navigation' });
        await expect(navigation).toBeVisible(); await expect(navigation.getByRole('button', { name: 'Close navigation' })).toBeFocused();
        await navigation.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
        if (width === 390 && role === 'Workshop') await page.screenshot({ path: testInfo.outputPath('phase-9a-mobile-navigation.png') });
        await page.keyboard.press('Escape'); await expect(navigation).not.toBeVisible();
        await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
      }
    }
    expect(errors).toEqual([]);
  });
}

test('Phase 9A controls, tab indicator, contrast, keyboard focus and reduced motion', async ({ page }, testInfo) => {
  test.slow(); await page.goto('/foundation'); await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'Precision, shared.' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search design tokens' });
  await search.fill('Cobalt'); await expect(page.getByRole('table', { name: 'Design token specimens' })).toContainText('#2F37D9');
  await search.fill('not a token'); await expect(page.getByRole('heading', { name: 'No matching tokens' })).toBeVisible(); await search.fill('');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible(); await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.getByText('Display options', { exact: true }).click();
  await expect(page.locator('details.kl-filter')).not.toHaveAttribute('open', '');
  await page.getByText('Display options', { exact: true }).click();
  const primary = page.getByRole('button', { name: 'Preview confirmation', exact: true });
  await primary.hover();
  await expect.poll(() => primary.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(64, 71, 224)');
  expect(await primary.evaluate(element => getComputedStyle(element).transitionProperty)).toContain('transform');
  expect(await primary.evaluate(element => getComputedStyle(element).borderRadius)).toBe('0px');
  await primary.click();
  const dialog = page.getByRole('dialog', { name: 'Shared confirmation preview' });
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('phase-9a-foundation-' + width + '.png'), fullPage: true });
  }
  const ratios = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    function luminance(hex: string) {
      const rgb = hex.trim().replace('#', '').match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
    }
    const white = luminance('#ffffff'); const result: Record<string, number> = {};
    for (const name of ['foreground', 'primary', 'muted-foreground', 'subtle-foreground', 'warning', 'success', 'destructive', 'input']) result[name] = (white + .05) / (luminance(css.getPropertyValue('--' + name)) + .05);
    return result;
  });
  for (const [name, ratio] of Object.entries(ratios)) expect(ratio, name + ' contrast').toBeGreaterThanOrEqual(name === 'input' ? 3 : 4.5);
  await testInfo.attach('contrast-ratios', { body: JSON.stringify(ratios, null, 2), contentType: 'application/json' });
  await page.goto('/login'); await page.getByRole('button', { name: 'Buyer', exact: true }).click();
  await page.goto('/buyer/jobs/job-1/quotes');
  const tabs = page.getByRole('navigation', { name: 'Job workspace' });
  await expect(tabs.getByRole('link', { name: 'Quotations', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link', { name: 'Workshop matches', exact: true })).not.toHaveAttribute('aria-current');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/buyer/dashboard');
  const heading = page.locator('.kl-page-header');
  expect(await heading.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  const logout = page.getByRole('button', { name: 'Log out', exact: true }); await logout.focus();
  expect(await logout.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  expect(await logout.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await logout.click();
  expect(await page.getByRole('dialog').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});
