import { describe, expect, it } from 'vitest';
import { clusterMarkers, markerText } from '@/ui/chart/markers';
import {
  canonicalFromChart,
  chartPrice,
  paddingTimes,
  seriesChange,
  seriesStep,
  visibleWindow,
  whitespaceEnd,
} from '@/ui/chart/scale';

describe('chart scale', () => {
  it('extends the time axis past the due date', () => {
    expect(whitespaceEnd(1_000, 1_000 + 100_000)).toBe(1_000 + 110_000);
  });

  it('fills the future with the series step and keeps overlay times', () => {
    const times = paddingTimes(1_000, 1_050, 10, [1_025, 900]);
    expect(times[0]).toBe(1_010);
    expect(times).toContain(1_025);
    expect(times).not.toContain(900);
    expect(times[times.length - 1]).toBe(1_050);
    expect(seriesStep([{ time: 0 }, { time: 10 }, { time: 20 }])).toBe(10);
    const capped = paddingTimes(0, 10_000, 1, [42]);
    expect(capped.length).toBeLessThanOrEqual(482);
    expect(capped).toContain(42);
  });

  it('fills the future with the series step and keeps overlay times', () => {
    const times = paddingTimes(1_000, 1_050, 10, [1_025, 900]);
    expect(times[0]).toBe(1_010);
    expect(times).toContain(1_025);
    expect(times).not.toContain(900);
    expect(times[times.length - 1]).toBe(1_050);
    expect(seriesStep([{ time: 0 }, { time: 10 }, { time: 20 }])).toBe(10);
    const capped = paddingTimes(0, 10_000, 1, [42]);
    expect(capped.length).toBeLessThanOrEqual(482);
    expect(capped).toContain(42);
  });

  it('windows a range from now and keeps the deadline in view for TO_DUE', () => {
    const now = 1_700_000_000;
    const first = now - 20 * 86_400;
    const due = now + 12 * 86_400;
    expect(visibleWindow('1D', now, first, due).from).toBe(now - 86_400);
    expect(visibleWindow('TO_DUE', now, first, due).to).toBe(whitespaceEnd(first, due));
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
