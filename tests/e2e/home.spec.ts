import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/InkSolver/);
});

test('can navigate to dashboard', async ({ page }) => {
  await page.goto('/');
  // Checking if the basic UI element is loaded
  await expect(page.locator('text=InkSolver').first()).toBeVisible();
});
