import { DataSourceError } from '@/contracts/data-source';
import { billSummarySchema } from '@/contracts/bill';
import { apiRequest } from '@/features/data/http';
import { buildBill } from '@/mocks/fixtures/build';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bill = buildBill({
  id: 'bill-1',
  state: 'WATCHING',
  vendorName: 'Acme GmbH',
  invoiceNumber: 'INV-1',
  pair: { base: 'EUR', quote: 'USD' },
  amount: '1000.00',
  dueDate: '2026-10-20',
  executionDeadline: '2026-10-18',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('parses a successful body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(bill), { status: 200 })),
    );
    await expect(apiRequest('/api/bills/bill-1', billSummarySchema)).resolves.toMatchObject({
      id: 'bill-1',
      state: 'WATCHING',
    });
  });

  it('throws the error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: 'INVALID_STATE', message: 'That bill changed' } }),
            { status: 409 },
          ),
      ),
    );
    await expect(apiRequest('/api/bills/bill-1/pause', billSummarySchema)).rejects.toMatchObject({
      name: 'DataSourceError',
      status: 409,
      error: { code: 'INVALID_STATE' },
    });
  });

  it('rejects a body that misses the contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(apiRequest('/api/bills', billSummarySchema)).rejects.toBeInstanceOf(DataSourceError);
  });
});
