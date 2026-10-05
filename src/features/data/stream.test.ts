import { QueryClient } from '@tanstack/react-query';
import { buildBill } from '@/mocks/fixtures/build';
import { qk } from '@/features/data/keys';
import { connectStream } from '@/features/data/stream';
import { applyAppEvent } from '@/features/data/stream-cache';
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
  lastPrice: '1.100000',
});

class FakeSource {
  static latest: FakeSource | undefined;
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, (event: MessageEvent) => void>();

  constructor(readonly url: string) {
    FakeSource.latest = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('connectStream', () => {
  it('delivers a parsed tick and backs off after errors', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const statuses: string[] = [];
    let polls = 0;
    connectStream({
      onEvent: (event) => events.push(event.type),
      onStatus: (status) => statuses.push(status),
      onPoll: () => {
        polls += 1;
      },
      EventSource: FakeSource,
      pollMs: 5_000,
    });
    const first = FakeSource.latest;
    first?.onopen?.(new Event('open'));
    first?.emit('tick', {
      type: 'tick',
      pair: { base: 'EUR', quote: 'USD' },
      ts: '2026-10-01T14:00:00.000Z',
      price: '1.09',
      source: 'AIRWALLEX',
    });
    expect(events).toEqual(['tick']);
    expect(statuses).toContain('live');

    first?.onerror?.(new Event('error'));
    expect(first?.closed).toBe(true);
    expect(statuses.at(-1)).toBe('delayed');
    vi.advanceTimersByTime(1_000);
    FakeSource.latest?.onerror?.(new Event('error'));
    vi.advanceTimersByTime(2_000);
    FakeSource.latest?.onerror?.(new Event('error'));
    expect(statuses.at(-1)).toBe('offline');
    expect(polls).toBe(1);
    vi.advanceTimersByTime(5_000);
    expect(polls).toBe(2);
  });

  it('ignores a payload that is not an app event', () => {
    const events: string[] = [];
    connectStream({
      onEvent: (event) => events.push(event.type),
      onStatus: () => undefined,
      onPoll: () => undefined,
      EventSource: FakeSource,
    });
    FakeSource.latest?.emit('tick', { type: 'tick' });
    expect(events).toEqual([]);
  });
});

describe('applyAppEvent', () => {
  it('writes a tick onto the matching bill', () => {
    const client = new QueryClient();
    client.setQueryData(qk.bills, [bill]);
    applyAppEvent(client, {
      type: 'tick',
      pair: { base: 'EUR', quote: 'USD' },
      ts: '2026-10-01T14:00:01.000Z',
      price: '1.08',
      source: 'AIRWALLEX',
    });
    expect(client.getQueryData<typeof bill[]>(qk.bills)?.[0]?.lastPrice).toBe('1.08');
  });
});
