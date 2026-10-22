import { test, expect } from '@playwright/test';

test('theme toggle changes the page background color', async ({ page }) => {
  await page.goto('/app.html');
  const backgroundBefore = await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor);
  await page.locator('#themeToggle').click();
  const backgroundAfter = await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor);

  expect(backgroundAfter).not.toBe(backgroundBefore);
});
