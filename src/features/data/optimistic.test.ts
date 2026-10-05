import { buildBill } from '@/mocks/fixtures/build';
import { billWithState, billWithStrategy } from '@/features/data/optimistic';
import { describe, expect, it } from 'vitest';

const watching = buildBill({
  id: 'bill-1',
  state: 'WATCHING',
  vendorName: 'Acme GmbH',
  invoiceNumber: 'INV-1',
  pair: { base: 'EUR', quote: 'USD' },
  amount: '1000.00',
  dueDate: '2026-10-20',
  executionDeadline: '2026-10-18',
  strategyMode: 'TARGET_RATE',
  targetPrice: '1.080000',
  lastPrice: '1.100000',
});

describe('optimistic bill patches', () => {
  it('pauses and resumes without waiting for the server', () => {
    const paused = billWithState(watching, 'PAUSED');
    expect(paused.state).toBe('PAUSED');
    expect(paused.allowedActions).toContain('RESUME');
    expect(paused.allowedActions).not.toContain('PAUSE');
    const resumed = billWithState(paused, 'WATCHING');
    expect(resumed.state).toBe('WATCHING');
    expect(resumed.allowedActions).toContain('PAUSE');
  });

  it('merges a strategy edit onto the cached bill', () => {
    const next = billWithStrategy(watching, { mode: 'MAX_COST', targetPrice: '1.050000', maxCost: '1100.00' });
    expect(next.strategyMode).toBe('MAX_COST');
    expect(next.targetPrice).toBe('1.050000');
    expect(next.maxCost).toBe('1100.00');
    expect(next.vendorName).toBe('Acme GmbH');
  });
});
