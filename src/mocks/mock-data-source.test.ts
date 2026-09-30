import { describe, expect, it } from 'vitest';
import { billDetailSchema } from '@/contracts/api';
import { billSummarySchema } from '@/contracts/bill';
import { chartResponseSchema } from '@/contracts/chart';
import { DataSourceError } from '@/contracts/data-source';
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
    await expect(source.pause('bill-draft', 'approver')).rejects.toMatchObject({
      status: 409,
      error: { code: 'INVALID_STATE' },
    });
  });

  it('rejects a preparer approval', async () => {
    const source = sourceAt(FIXTURE_NOW);
    await expect(
      source.approve('ap-target', 'preparer'),
    ).rejects.toBeInstanceOf(DataSourceError);
    await expect(source.approve('ap-target', 'preparer')).rejects.toMatchObject(
      {
        status: 403,
        error: { code: 'FORBIDDEN' },
      },
    );
    expect((await source.getBill('bill-target-hit')).state).toBe('TARGET_HIT');
  });

  it('approves a target hit and stops at APPROVED', async () => {
    const source = sourceAt(FIXTURE_NOW);
    const summary = billSummarySchema.parse(
      await source.approve('ap-target', 'approver'),
    );
    expect(summary.state).toBe('APPROVED');
    expect(summary.activeApproval?.status).toBe('APPROVED');
    expect(summary.activeApproval?.autoApproved).toBe(false);
    expect(summary.execution).toBeUndefined();
    const detail = billDetailSchema.parse(
      await source.getBill('bill-target-hit'),
    );
    expect(
      detail.events.some(
        (event) => event.type === 'APPROVED' && event.actor === 'user:approver',
      ),
    ).toBe(true);
  });

  it('leaves the bill alone when the quote has expired', async () => {
    const source = sourceAt('2026-10-01T15:00:00.000Z');
    await expect(source.approve('ap-target', 'approver')).rejects.toMatchObject(
      {
        status: 409,
        error: { code: 'QUOTE_EXPIRED' },
      },
    );
    const bill = await source.getBill('bill-target-hit');
    expect(bill.state).toBe('TARGET_HIT');
    expect(bill.activeApproval?.status).toBe('PENDING');
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
    await source.simulate('bill-watching', 'approver', { durationSec: 12 });
    real += 30_000;
    source.pump('bill-watching');
    const bill = billDetailSchema.parse(await source.getBill('bill-watching'));
    expect(bill.state).toBe('PAID');
    expect(bill.execution?.status).toBe('PAID');
    expect(bill.activeApproval?.autoApproved).toBe(true);
    expect(bill.activeApproval?.trigger?.simulated).toBe(true);
    expect(
      bill.events.some(
        (event) =>
          event.type === 'APPROVED' &&
          event.actor === 'system:demo-sim' &&
          event.payload?.auto === true,
      ),
    ).toBe(true);
    expect(seen).toEqual([
      'RAMPING',
      'TRIGGERED',
      'AUTO_APPROVED',
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
    await source.simulate('bill-watching', 'approver');
    real += 1000;
    source.pump('bill-watching');
    const stopped = await source.stopSimulation('bill-watching', 'approver');
    expect(stopped.state).toBe('WATCHING');
    expect(phases).toContain('ABORTED');
    expect(
      (await source.getBill('bill-watching')).events.at(-1)?.payload,
    ).toMatchObject({ aborted: true });
  });
});
