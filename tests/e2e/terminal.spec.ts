import { expect, test } from '@playwright/test';

test('terminal lists bills and opens one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Acme GmbH/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Acme GmbH 250,000\.00 EUR.*Watching/ }).click();
  await expect(page).toHaveURL(/\/bills\/bill-watching/);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('settings shows the account time zone', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Account time zone America/Los_Angeles')).toBeVisible();
});
