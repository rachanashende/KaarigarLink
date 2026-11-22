import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('ARIA reflection and labelled controls survive an axe audit', async ({ page }) => {
  await page.setContent('<!doctype html><html lang="en"><head><title>ARIA compatibility regression</title></head><body><main><section aria-labelledby="heading"><h1 id="heading">Sign in</h1><label for="password">Password</label><input id="password" type="password"></section></main></body></html>');
  await page.getByLabel('Password', { exact: true }).focus();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  // Exercise the same ARIA references in Playwright's isolated world and the page world.
  expect(await page.evaluate(() => document.querySelector('section')?.ariaLabelledByElements?.map(element => element.id))).toEqual(['heading']);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-regression-value');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('synthetic-regression-value');
});
