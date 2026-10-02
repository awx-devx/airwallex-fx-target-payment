import { describe, expect, it } from 'vitest';
import { billDetailSchema } from '@/contracts/api';
import { billSummarySchema } from '@/contracts/bill';
import { chartResponseSchema } from '@/contracts/chart';
import { appEventSchema } from '@/contracts/sse';
import { FIXTURE_NOW } from '@/mocks/fixtures/build';
import { ManualClock } from '@/mocks/market/clock';
import { MockDataSource } from '@/mocks/mock-data-source';

function sourceAt(iso: string, readRealMs?: () => number): MockDataSource {
  return new MockDataSource({
    clock: new ManualClock(Date.parse(iso)),
    readRealMs,
  });
}

describe('MockDataSource', () => {
  it('rejects an action the state does not allow', async () => {
    const source = sourceAt(FIXTURE_NOW);
    await expect(source.pause('bill-draft')).rejects.toMatchObject({
      status: 409,
      error: { code: 'INVALID_STATE' },
    });
  });

  it('pays a watching bill immediately', async () => {
    const source = sourceAt(FIXTURE_NOW);
    const summary = billSummarySchema.parse(await source.payNow('bill-watching'));
    expect(summary.state).toBe('EXECUTING');
    expect(summary.execution?.status).toBe('SCHEDULED');
    expect(summary.execution?.mode).toBe('MANUAL');
    const detail = billDetailSchema.parse(await source.getBill('bill-watching'));
    expect(
      detail.events.some(
        (event) => event.type === 'QUOTE_LOCKED' && event.actor === 'user',
      ),
    ).toBe(true);
  });

  it('emits contract ticks from the seeded market', () => {
    const source = sourceAt(FIXTURE_NOW);
    const events = source.stepMarket();
    expect(events.some((event) => event.type === 'tick')).toBe(true);
    for (const event of events) appEventSchema.parse(event);
  });

  it('runs a simulate timeline through to PAID', async () => {
    let real = 1_000_000;
    const source = sourceAt(FIXTURE_NOW, () => real);
    const seen: string[] = [];
    source.subscribe((event) => {
      if (event.type === 'demo.sim') seen.push(event.phase);
    });
    await source.simulate('bill-watching', { durationSec: 12 });
    real += 30_000;
    source.pump('bill-watching');
    const bill = billDetailSchema.parse(await source.getBill('bill-watching'));
    expect(bill.state).toBe('PAID');
    expect(bill.execution?.status).toBe('PAID');
    expect(bill.execution?.mode).toBe('TARGET');
    expect(
      bill.events.some(
        (event) =>
          event.type === 'QUOTE_LOCKED' && event.actor === 'system:demo-sim',
      ),
    ).toBe(true);
    expect(seen).toEqual([
      'RAMPING',
      'TRIGGERED',
      'EXECUTING',
      'SETTLING',
      'SETTLING',
      'SETTLING',
      'DONE',
    ]);
    chartResponseSchema.parse(
      await source.getChart('bill-watching', { range: '1D' }),
    );
  });

  it('aborts a simulation that is still ramping', async () => {
    let real = 5_000;
    const source = sourceAt(FIXTURE_NOW, () => real);
    const phases: string[] = [];
    source.subscribe((event) => {
      if (event.type === 'demo.sim') phases.push(event.phase);
    });
    await source.simulate('bill-watching');
    real += 1000;
    source.pump('bill-watching');
    const stopped = await source.stopSimulation('bill-watching');
    expect(stopped.state).toBe('WATCHING');
    expect(phases).toContain('ABORTED');
    expect(
      (await source.getBill('bill-watching')).events.at(-1)?.payload,
    ).toMatchObject({ aborted: true });
  });

  it('keeps a readable chart after the market ticks', async () => {
    const source = sourceAt(FIXTURE_NOW);
    source.stepMarket();
    const chart = await source.getChart('bill-watching', { range: 'TO_DUE' });
    expect(chart.series.length).toBeGreaterThan(24);
    const bill = await source.getBill('bill-watching');
    expect(chart.series.at(-1)?.value).toBe(bill.lastPrice);
    for (let index = 1; index < chart.series.length; index += 1) {
      expect(chart.series[index]!.time).toBeGreaterThan(chart.series[index - 1]!.time);
    }
  });

  it('pays a watching bill when the clock jumps to its deadline', async () => {
    const source = sourceAt(FIXTURE_NOW);
    source.jumpToDeadline('bill-watching');
    expect(source.clock.now().toISOString().slice(0, 10)).toBe('2026-10-09');
    const bill = await source.getBill('bill-watching');
    expect(bill.state).toBe('EXECUTING');
    expect(bill.execution?.mode).toBe('DEADLINE');
    expect(bill.events.some((event) => event.type === 'AUTOSETTLE')).toBe(true);
  });
});
