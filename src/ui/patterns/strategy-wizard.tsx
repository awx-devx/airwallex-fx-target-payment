'use client';

import type { ChartOverlays, ChartRange, ChartSeriesPoint } from '@/contracts/chart';
import type { Pair, StrategyMode } from '@/contracts/bill';
import { roundToPayout } from '@/contracts/currencies';
import { D, decimalString, significantPrice } from '@/contracts/money';
import { formatMoney, formatPrice } from '@/ui/format';
import { useState } from 'react';
import { FxChart } from '@/ui/chart/fx-chart';
import { AmountInput } from '@/ui/primitives/amount-input';
import { RateInput } from '@/ui/primitives/rate-input';
import { SegmentedControl } from '@/ui/primitives/segmented';

/** Fee is 0 until a strategy exists, matching the first save. An incomplete cost returns undefined. */
export function targetFromMaxCost(maxCost: string, amount: string): string | undefined {
  if (!maxCost || !amount) return undefined;
  try {
    const bill = D(amount);
    if (bill.isZero() || !D(maxCost).gt(0)) return undefined;
    return significantPrice(D(maxCost).div(bill));
  } catch {
    return undefined;
  }
}

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
  state,
  step,
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
  state?: 'ready' | 'loading';
  step?: number;
}) {
  const [range, setRange] = useState<ChartRange>('TO_DUE');
  const implied = mode === 'MAX_COST' ? targetFromMaxCost(maxCost, amount) : undefined;
  const line = implied ?? target;
  const cost =
    target && amount
      ? formatMoney(homeCurrency, decimalString(D(amount).mul(D(target))))
      : undefined;
  const dragTarget = (price: string) => {
    if (mode === 'MAX_COST' && amount) {
      try {
        onMaxCostChange(roundToPayout(homeCurrency, D(amount).mul(D(price))));
      } catch {
        // A price that cannot be priced leaves the cost field as it is.
      }
    }
    onTargetChange(price);
  };
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
        {mode === 'MAX_COST'
          ? line
            ? `Target ${formatPrice(pair, line)}`
            : 'Enter a max cost'
          : cost
            ? `${formatMoney(pair.base, amount)} at this target is about ${cost}`
            : 'Enter a target rate'}
      </p>
      <FxChart
        pair={pair}
        series={series}
        overlays={{ ...overlays, ...(line ? { target: line } : {}) }}
        range={range}
        step={step}
        onRangeChange={setRange}
        strategyMode={mode}
        interactive
        onTargetDrag={dragTarget}
        showHeader={false}
        state={state}
        height={220}
        notional={{ amount, currency: homeCurrency }}
      />
    </div>
  );
}
