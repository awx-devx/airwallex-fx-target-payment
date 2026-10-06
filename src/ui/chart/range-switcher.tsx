'use client';

import { CHART_RANGES, type ChartRange } from '@/contracts/chart';
import { SegmentedControl } from '@/ui/primitives/segmented';

const LABEL: Record<ChartRange, string> = {
  '1D': '1D',
  '5D': '5D',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  YTD: 'YTD',
  '1Y': '1Y',
  TO_DUE: 'To due',
};

export function RangeSwitcher({
  value,
  onValueChange,
}: {
  value: ChartRange;
  onValueChange: (range: ChartRange) => void;
}) {
  return (
    <SegmentedControl
      label="Chart range"
      size="sm"
      value={value}
      onValueChange={onValueChange}
      options={CHART_RANGES.map((range) => ({ value: range, label: LABEL[range] }))}
    />
  );
}
