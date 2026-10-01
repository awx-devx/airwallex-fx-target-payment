'use client';

import type { ChartOverlays, ChartRange, ChartSeriesPoint } from '@/contracts/chart';
import type { Pair, StrategyMode } from '@/contracts/bill';
import { D } from '@/contracts/money';
import { formatMoney } from '@/ui/format';
import { useState } from 'react';
import { FxChart } from '@/ui/chart/fx-chart';
import { AmountInput } from '@/ui/primitives/amount-input';
import { RateInput } from '@/ui/primitives/rate-input';
import { SegmentedControl } from '@/ui/primitives/segmented';

export function StrategyWizardStep({
  pair,
  amount,
  mode,
  onModeChange,
  target,
  onTargetChange,
  maxCost,
  onMaxCostChange,
  homeCurrency,
  series,
  overlays,
}: {
  pair: Pair;
  amount: string;
  mode: StrategyMode;
  onModeChange: (mode: StrategyMode) => void;
  target: string;
  onTargetChange: (price: string) => void;
  maxCost: string;
  onMaxCostChange: (cost: string) => void;
  homeCurrency: string;
  series: ChartSeriesPoint[];
  overlays: ChartOverlays;
}) {
  const [range, setRange] = useState<ChartRange>('TO_DUE');
  const cost = formatMoney(homeCurrency, D(amount).mul(D(target)).toString());
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Strategy mode"
        size="sm"
        value={mode}
        onValueChange={onModeChange}
        options={[
          { value: 'TARGET_RATE', label: 'Target rate' },
          { value: 'MAX_COST', label: 'Max cost' },
        ]}
      />
      {mode === 'TARGET_RATE' ? (
        <RateInput pair={pair} value={target} onValueChange={onTargetChange} entry={overlays.entry} />
      ) : (
        <AmountInput currency={homeCurrency} value={maxCost} onValueChange={onMaxCostChange} label="Max cost" />
      )}
      <p className="num text-xs text-fg-2">
        {formatMoney(pair.base, amount)} at this target is about {cost}
      </p>
      <FxChart
        pair={pair}
        series={series}
        overlays={{ ...overlays, target }}
        range={range}
        onRangeChange={setRange}
        strategyMode={mode}
        interactive
        onTargetDrag={onTargetChange}
        showHeader={false}
        height={220}
        notional={{ amount, currency: homeCurrency }}
      />
    </div>
  );
}
