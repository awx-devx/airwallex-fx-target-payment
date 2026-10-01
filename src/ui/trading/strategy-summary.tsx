import type { Pair, StrategyMode } from '@/contracts/bill';
import { formatDelta, formatMoney, formatPrice } from '@/ui/format';

export function StrategySummary({
  pair,
  mode,
  targetPrice,
  maxCost,
  homeCurrency,
  bufferBps = '0',
}: {
  pair: Pair;
  mode?: StrategyMode;
  targetPrice?: string;
  maxCost?: string;
  homeCurrency: string;
  bufferBps?: string;
}) {
  if (!mode) return <p className="text-fg-3">Strategy not set</p>;
  const parts = [
    targetPrice ? `Target ${formatPrice(pair, targetPrice)}` : undefined,
    maxCost ? `Max cost ${formatMoney(homeCurrency, maxCost)}` : undefined,
    `Buffer ${formatDelta(bufferBps, { mode: 'bps' })}`,
  ].filter(Boolean);
  return <p className="num text-fg-1">{parts.join(' · ')}</p>;
}
