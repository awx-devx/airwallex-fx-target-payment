import { describe, expect, it } from 'vitest';
import { clusterMarkers, markerText } from '@/ui/chart/markers';
import { tradingTimes } from '@/contracts/chartGrid';
import {
  canonicalFromChart,
  chartPrice,
  clampLogicalToWidth,
  futureTimes,
  gridOffset,
  paddingHorizon,
  seriesChange,
  snapToBar,
  visibleLogical,
} from '@/ui/chart/scale';

describe('chart scale', () => {
  it('pads the future on the trading grid and caps a distant due date', () => {
    const last = Math.floor(Date.parse('2026-10-06T12:00:00.000Z') / 1000);
    const times = futureTimes(last, last + 3600, 300);
    expect(times[0]).toBe(last + 300);
    expect(times).not.toContain(last);
    expect(futureTimes(0, 86_400 * 400, 300).length).toBeLessThanOrEqual(20_000);
  });

  it('shows 288 bars for 1D, a year index for 1Y, and the due date plus 10% for TO_DUE', () => {
    const now = Math.floor(Date.parse('2026-10-07T12:00:00.000Z') / 1000);
    const times = tradingTimes(now - 3 * 86_400, now, 300);
    const nowIndex = times.length - 1;
    const day = visibleLogical('1D', times, now, now + 12 * 86_400);
    expect(day.from).toBe(nowIndex - 287);
    expect(day.to).toBe(nowIndex + Math.max(1, Math.round(287 * 0.04)));

    const year = tradingTimes(now - 400 * 86_400, now, 86_400);
    const yearView = visibleLogical('1Y', year, now, now + 12 * 86_400);
    const start = now - 365 * 86_400;
    expect(year[yearView.from]).toBeGreaterThanOrEqual(start);
    expect(year[(yearView.from ?? 1) - 1] ?? 0).toBeLessThan(start);

    const due = now + 20 * 3600;
    const span = tradingTimes(now - 10 * 86_400, due + 86_400, 3600);
    const dueView = visibleLogical('TO_DUE', span, now, due);
    const dueIndex = span.findIndex((time) => time >= due);
    expect(dueView.from).toBe(0);
    expect(dueView.to).toBeGreaterThan(dueIndex);
    expect(dueView.to).toBe(dueIndex + Math.max(1, Math.round(dueIndex * 0.1)));
    const fitted = clampLogicalToWidth(dueView, 100, 1);
    expect(fitted.to).toBe(dueView.to);
    expect(fitted.from).toBeGreaterThan(dueView.from);
    expect(paddingHorizon('TO_DUE', now, due, span[0] ?? now)).toBe(
      Math.round(due + (due - (span[0] ?? now)) * 0.1),
    );
  });

  it('interpolates inside a session and jumps a weekend gap to the next bar', () => {
    expect(gridOffset(150, [0, 300, 600], 300)).toBe(0.5);
    const friday = Math.floor(Date.parse('2026-10-02T21:00:00.000Z') / 1000);
    const sunday = Math.floor(Date.parse('2026-10-04T22:00:00.000Z') / 1000);
    expect(gridOffset(friday + 3600, [friday, sunday], 3600)).toBe(1);
    expect(snapToBar(150, [0, 300, 600])).toBe(0);
    expect(snapToBar(200, [0, 300, 600])).toBe(300);
  });

  it('treats one appended tick as an update', () => {
    const previous = [
      { time: 1, value: '1.08' },
      { time: 2, value: '1.081' },
    ];
    expect(seriesChange(previous, previous)).toBe('same');
    expect(seriesChange(previous, [...previous, { time: 3, value: '1.082' }])).toBe(
      'update',
    );
    expect(seriesChange(previous, [{ time: 9, value: '1.1' }])).toBe('replace');
  });

  it('round-trips a canonical price through the chart number', () => {
    expect(canonicalFromChart(chartPrice('1.08', false), false)).toBe('1.08');
    const inverted = chartPrice('0.0067', true);
    expect(inverted).toBeGreaterThan(100);
    expect(canonicalFromChart(inverted, true).startsWith('0.0067')).toBe(true);
  });
});

describe('clusterMarkers', () => {
  it('collapses overlapping times and keeps isolated ones', () => {
    const markers = [
      { time: 10, kind: 'ARMED' as const, price: 1, text: '' },
      { time: 11, kind: 'NEAR_MISS' as const, price: 1, text: '' },
      { time: 40, kind: 'TARGET_HIT' as const, price: 1, text: '' },
    ];
    const clustered = clusterMarkers(markers, (time) => time);
    expect(clustered).toHaveLength(2);
    expect(clustered[0]?.text).toBe('2');
    expect(clustered[1]?.kind).toBe('TARGET_HIT');
    expect(markerText('SIM_START')).toBe('SIM');
    expect(markerText('AUTOSETTLE')).toBe('⚡');
  });
});
