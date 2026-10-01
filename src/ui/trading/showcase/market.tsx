'use client';

import { useSyncExternalStore, useEffect, useState } from 'react';
import { useTimeFrozen } from '@/ui/motion/freeze';
import type { Showcase } from '@/ui/showcase/types';
import { Cell, Matrix } from '@/ui/primitives/showcase/frame';
import { CountdownChip } from '@/ui/trading/countdown-chip';
import { DeadlineMeter } from '@/ui/trading/deadline-meter';
import { DeltaText } from '@/ui/trading/delta-text';
import { DistanceToTarget } from '@/ui/trading/distance-to-target';
import { PairLabel } from '@/ui/trading/pair-label';
import { PriceDisplay } from '@/ui/trading/price-display';
import { PriceTicker } from '@/ui/trading/price-ticker';
import { Sparkline } from '@/ui/trading/sparkline';
import { EUR_USD_TICKS, NOW, PAIR } from '@/ui/trading/trading.fixtures';

const JPY = { base: 'JPY', quote: 'USD' };

function useMarketIntervalMs(): number {
  const speed = useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      const root = document.documentElement;
      observer.observe(root, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-market-speed'],
      });
      return () => observer.disconnect();
    },
    () => document.querySelector('[data-market-speed]')?.getAttribute('data-market-speed') ?? '1',
    () => '1',
  );
  const multiplier = speed === '60' ? 60 : speed === '10' ? 10 : 1;
  return 500 / multiplier;
}

function LiveTicker() {
  const frozen = useTimeFrozen();
  const intervalMs = useMarketIntervalMs();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (frozen) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % EUR_USD_TICKS.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [frozen, intervalMs]);
  const price = EUR_USD_TICKS[frozen ? 0 : index] ?? EUR_USD_TICKS[0] ?? '1.0862';
  return (
    <div className="space-y-3">
      <PriceDisplay pair={PAIR} value={price} size="hero" flash />
      <PriceTicker pair={PAIR} price={price} entry="1.0862" />
      <Sparkline points={EUR_USD_TICKS.slice(0, 16)} target="1.08" />
    </div>
  );
}

export const marketShowcases: Showcase[] = [
  {
    id: 'pair-label',
    group: 'trading',
    title: 'PairLabel',
    importPath: '@/ui/trading/pair-label',
    sections: [
      {
        id: 'pair-label-matrix',
        title: 'Sizes, inverted, payout only',
        render: () => (
          <Matrix>
            <Cell label="sm"><PairLabel pair={PAIR} size="sm" /></Cell>
            <Cell label="md"><PairLabel pair={PAIR} /></Cell>
            <Cell label="lg"><PairLabel pair={PAIR} size="lg" /></Cell>
            <Cell label="inverted"><PairLabel pair={JPY} inverted size="lg" /></Cell>
            <Cell label="payout only"><PairLabel pair={PAIR} payoutOnly /></Cell>
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'price-display',
    group: 'trading',
    title: 'PriceDisplay',
    importPath: '@/ui/trading/price-display',
    sections: [
      {
        id: 'price-display-matrix',
        title: 'Inline, hero, axis, stale',
        render: () => (
          <div className="space-y-4">
            <Matrix>
              <Cell label="inline"><PriceDisplay pair={PAIR} value="1.08425" /></Cell>
              <Cell label="axis"><PriceDisplay pair={PAIR} value="1.08425" size="axis" /></Cell>
              <Cell label="stale"><PriceDisplay pair={PAIR} value="1.08425" stale /></Cell>
              <Cell label="flash"><PriceDisplay pair={PAIR} value="1.083" flash /></Cell>
            </Matrix>
            <Cell label="hero">
              <PriceDisplay pair={PAIR} value="1.08425" size="hero" />
            </Cell>
          </div>
        ),
      },
      {
        id: 'price-live',
        title: 'Simulator ticks',
        render: () => <LiveTicker />,
      },
    ],
  },
  {
    id: 'price-ticker',
    group: 'trading',
    title: 'PriceTicker',
    importPath: '@/ui/trading/price-ticker',
    sections: [
      {
        id: 'price-ticker-matrix',
        title: 'Favourable, adverse, stale, disconnected',
        render: () => (
          <div className="grid gap-3">
            <PriceTicker pair={PAIR} price="1.08" entry="1.09" />
            <PriceTicker pair={PAIR} price="1.1" entry="1.09" size="compact" />
            <PriceTicker pair={PAIR} price="1.09" entry="1.09" stale />
            <PriceTicker pair={PAIR} price="1.09" entry="1.09" disconnected />
          </div>
        ),
      },
    ],
  },
  {
    id: 'delta-text',
    group: 'trading',
    title: 'DeltaText',
    importPath: '@/ui/trading/delta-text',
    sections: [
      {
        id: 'delta-text-matrix',
        title: 'Percent, basis points, price, zero',
        render: () => (
          <Matrix>
            <Cell label="pct"><DeltaText value="0.0042" mode="pct" /></Cell>
            <Cell label="bps"><DeltaText value="-12" mode="bps" /></Cell>
            <Cell label="abs"><DeltaText value="-0.0012" mode="abs" pair={PAIR} /></Cell>
            <Cell label="zero"><DeltaText value="0" mode="pct" /></Cell>
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'distance',
    group: 'trading',
    title: 'DistanceToTarget',
    importPath: '@/ui/trading/distance-to-target',
    sections: [
      {
        id: 'distance-matrix',
        title: 'Far, near, through, inverted',
        render: () => (
          <div className="grid max-w-xl gap-4">
            <Cell label="far"><DistanceToTarget pair={PAIR} price="1.10" target="1.08" /></Cell>
            <Cell label="near"><DistanceToTarget pair={PAIR} price="1.082" target="1.08" /></Cell>
            <Cell label="through"><DistanceToTarget pair={PAIR} price="1.074" target="1.08" /></Cell>
            <Cell label="inverted">
              <DistanceToTarget pair={JPY} price="0.0068" target="0.0067" inverted />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'countdown',
    group: 'trading',
    title: 'CountdownChip',
    importPath: '@/ui/trading/countdown-chip',
    sections: [
      {
        id: 'countdown-matrix',
        title: 'Quote, deadline, auto-settle, urgency',
        render: () => (
          <Matrix>
            <Cell label="quote">
              <CountdownChip now={NOW} until="2026-10-01T12:14:15.000Z" />
            </Cell>
            <Cell label="warn">
              <CountdownChip now={NOW} until="2026-10-01T12:04:00.000Z" />
            </Cell>
            <Cell label="urgent">
              <CountdownChip now={NOW} until="2026-10-01T12:00:40.000Z" />
            </Cell>
            <Cell label="expired">
              <CountdownChip now={NOW} until="2026-10-01T11:00:00.000Z" />
            </Cell>
            <Cell label="deadline">
              <CountdownChip now={NOW} until="2026-10-03T16:00:00.000Z" kind="deadline" />
            </Cell>
            <Cell label="auto-settle">
              <CountdownChip now={NOW} until="2026-10-01T14:00:00.000Z" kind="autosettle" />
            </Cell>
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'deadline-meter',
    group: 'trading',
    title: 'DeadlineMeter',
    importPath: '@/ui/trading/deadline-meter',
    sections: [
      {
        id: 'deadline-meter-matrix',
        title: 'Normal, final day, overdue, skipped day',
        render: () => (
          <div className="grid max-w-xl gap-4">
            <Cell label="full">
              <DeadlineMeter
                armedAt="2026-10-01"
                now="2026-12-18"
                executeBy="2026-12-20"
                due="2026-12-31"
                skipped={[{ date: '2026-12-25', reason: 'Christmas Day' }]}
              />
            </Cell>
            <Cell label="final day">
              <DeadlineMeter
                armedAt="2026-10-01"
                now="2026-12-20"
                executeBy="2026-12-20"
                due="2026-12-31"
                finalDay
              />
            </Cell>
            <Cell label="overdue">
              <DeadlineMeter
                armedAt="2026-10-01"
                now="2026-12-22"
                executeBy="2026-12-20"
                due="2026-12-31"
                overdue
              />
            </Cell>
            <Cell label="compact">
              <DeadlineMeter
                variant="compact"
                armedAt="2026-10-01"
                now="2026-12-18"
                executeBy="2026-12-20"
                due="2026-12-31"
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'sparkline',
    group: 'trading',
    title: 'Sparkline',
    importPath: '@/ui/trading/sparkline',
    sections: [
      {
        id: 'sparkline-matrix',
        title: 'Favourable, adverse, target hit, loading',
        render: () => (
          <Matrix>
            <Cell label="down">
              <Sparkline points={['1.09', '1.088', '1.086', '1.084']} target="1.08" />
            </Cell>
            <Cell label="up">
              <Sparkline points={['1.08', '1.082', '1.086', '1.09']} target="1.07" />
            </Cell>
            <Cell label="hit">
              <Sparkline points={['1.09', '1.085', '1.08', '1.074']} target="1.08" />
            </Cell>
            <Cell label="loading"><Sparkline points={[]} loading /></Cell>
            <Cell label="empty"><Sparkline points={['1.08']} /></Cell>
          </Matrix>
        ),
      },
    ],
  },
];
