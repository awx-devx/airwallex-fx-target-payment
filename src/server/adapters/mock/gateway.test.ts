import { describe, expect, it } from 'vitest';
import { D } from '@/contracts/money';
import {
  MockPaymentsGateway,
  MockQuoteProvider,
  MockRateSource,
} from '@/server/adapters/mock/gateway';

const clock = { now: () => new Date('2026-01-01T00:00:00.000Z') };
const instant = async () => undefined;

describe('mock gateways', () => {
  it('injects a failure and then a rate', async () => {
    const rates = new MockRateSource({
      clock,
      price: '1.1000',
      sleep: instant,
      latencyMs: { getIndicative: 40 },
      failures: [
        { method: 'getIndicative', times: 1, error: new Error('feed down') },
      ],
    });
    await expect(rates.getIndicative()).rejects.toThrow(/feed down/);
    const tick = await rates.getIndicative();
    expect(tick.price.toFixed()).toBe('1.1');
    expect(tick.source).toBe('SIMULATED');
  });

  it('locks a quote and reuses a transfer request id', async () => {
    const quotes = new MockQuoteProvider({
      clock,
      price: '1.25',
      sleep: instant,
      latencyMs: { lock: 0 },
    });
    const quote = await quotes.lock({
      buy: 'EUR',
      sell: 'USD',
      buyAmount: D('100'),
      validity: 'MIN_1',
    });
    expect(quote.price).toBe('1.25');
    expect(quote.sellAmount).toBe('125');

    const payments = new MockPaymentsGateway({
      clock,
      sleep: instant,
      latencyMs: { createTransfer: 0, getTransfer: 0 },
    });
    const input = {
      billId: 'bill-1',
      attempt: 1,
      beneficiaryId: 'ben-1',
      transferCurrency: 'EUR',
      transferAmount: '100.00',
      sourceCurrency: 'USD',
      sourceAmount: '125.00',
      rate: '1.25',
      transferMethod: 'LOCAL' as const,
      reason: 'bill_payment' as const,
      reference: 'INV-1',
      mode: 'TARGET' as const,
    };
    const first = await payments.createTransfer(input);
    const second = await payments.createTransfer(input);
    expect(second).toEqual(first);
    const stored = await payments.getTransfer(first.transferId);
    expect(stored.requestId).toBe('tr:bill-1:1');
    expect(stored.status).toBe('PROCESSING');
  });
});
