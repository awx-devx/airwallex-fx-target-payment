import { expect, test } from '@playwright/test';

const sandbox = process.env.E2E_SANDBOX === '1';

test.describe('sandbox @sandbox', () => {
  test.skip(!sandbox, 'Set E2E_SANDBOX=1 with NEXT_PUBLIC_DATA_SOURCE=api to run against the sandbox');

  test('the terminal lists bills from the api', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('table', { name: 'Positions' })).toBeVisible();
  });
});
