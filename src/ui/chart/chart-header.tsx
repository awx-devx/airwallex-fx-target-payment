'use client';

import type { ChartRange } from '@/contracts/chart';
import type { Pair } from '@/contracts/bill';
import { D, decimalString } from '@/contracts/money';
import { ConnectionIndicator } from '@/ui/trading/connection-indicator';
import { CountdownChip } from '@/ui/trading/countdown-chip';
import { DeltaText } from '@/ui/trading/delta-text';
import { PairLabel } from '@/ui/trading/pair-label';
import { PriceDisplay } from '@/ui/trading/price-display';
import { RangeSwitcher } from '@/ui/chart/range-switcher';
import { SegmentedControl } from '@/ui/primitives/segmented';

export type ChartType = 'area' | 'line' | 'candles';
export type FeedState = 'live' | 'delayed' | 'offline' | 'simulated';

export function ChartHeader({
  pair,
  price,
  entry,
  inverted = false,
  stale = false,
  connection = 'live',
  range,
  onRangeChange,
  type,
  onTypeChange,
  autosettleAt,
  now,
}: {
  pair: Pair;
  price?: string;
  entry?: string;
  inverted?: boolean;
  stale?: boolean;
  connection?: FeedState;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  type: ChartType;
  onTypeChange: (type: ChartType) => void;
  autosettleAt?: string;
  now?: string;
}) {
  const delta =
    price && entry ? decimalString(D(price).minus(D(entry))) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PairLabel pair={pair} inverted={inverted} size="lg" />
      {price ? (
        <PriceDisplay pair={pair} value={price} inverted={inverted} size="hero" stale={stale} flash />
      ) : null}
      {delta ? <DeltaText value={delta} pair={pair} /> : null}
      <ConnectionIndicator state={connection} />
      {autosettleAt && now ? (
        <CountdownChip until={autosettleAt} now={now} kind="autosettle" />
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Chart type"
          size="sm"
          value={type}
          onValueChange={onTypeChange}
          options={[
            { value: 'area', label: 'Area' },
            { value: 'line', label: 'Line' },
            { value: 'candles', label: 'Candles' },
          ]}
        />
        <RangeSwitcher value={range} onValueChange={onRangeChange} />
      </div>
    </div>
  );
}
