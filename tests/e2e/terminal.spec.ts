import { expect, test } from '@playwright/test';

test('terminal lists bills and opens one', async ({ page }) => {
  await page.goto('/');
  const watching = page.getByRole('button', { name: /Acme GmbH 250,000\.00 EUR.*Watching/ });
  if ((await watching.count()) === 0) {
    test.skip(true, 'The mock watching fixture is not on this data source');
    return;
  }
  await watching.click();
  await expect(page).toHaveURL(/\/bills\/bill-watching/);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('settings shows the account time zone', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Account time zone America/Los_Angeles')).toBeVisible();
});
