import { expect, test, type Page } from '@playwright/test';

test('a closed draft reopens on review', async ({ page }) => {
  const invoice = await openSampleReview(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Review bill' })).toBeHidden();

  const id = await billIdForInvoice(page, invoice);
  await page.goto(`/bills/${id}`);
  await page.getByRole('button', { name: 'Open ticket' }).click();
  await page.getByRole('button', { name: 'Review bill' }).click();
  await expect(page.getByRole('heading', { name: 'Review bill' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Invoice' })).toHaveValue(invoice);
});

test('a ready bill with no target reopens on the target step', async ({ page }) => {
  const invoice = await openSampleReview(page);
  await page.getByRole('button', { name: 'Continue to strategy' }).click();
  await expect(page.getByRole('heading', { name: 'Set target' })).toBeVisible();
  await page.keyboard.press('Escape');

  const id = await billIdForInvoice(page, invoice);
  await page.goto(`/bills/${id}`);
  await page.getByRole('button', { name: 'Open ticket' }).click();
  await page.getByRole('button', { name: 'Set target' }).click();
  await expect(page.getByRole('heading', { name: 'Set target' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arm bill' })).toBeVisible();
});

test('a text file is rejected before upload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Upload bills' }).first().click();
  await page.getByLabel('Invoice files').setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an invoice'),
  });
  await expect(page.getByRole('button', { name: 'Choose invoices' }).getByText('note.txt must be a PDF, PNG, or JPG')).toBeVisible();
});

async function openSampleReview(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Upload bills' }).first().click();
  await page.getByRole('button', { name: 'Add 1 sample invoice' }).click();
  await page.getByRole('button', { name: 'Review 1 bills' }).click();
  await expect(page.getByRole('heading', { name: 'Review bill' })).toBeVisible();
  return page.getByRole('textbox', { name: 'Invoice' }).inputValue();
}

async function billIdForInvoice(page: Page, invoice: string): Promise<string> {
  const response = await page.request.get('/api/bills');
  expect(response.ok()).toBeTruthy();
  const bills = (await response.json()) as { id: string; invoiceNumber: string }[];
  const match = bills.find((bill) => bill.invoiceNumber === invoice);
  expect(match).toBeTruthy();
  return match?.id ?? '';
}
