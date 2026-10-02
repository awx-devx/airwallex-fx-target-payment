'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from 'react';
import type { ChartOverlays, ChartRange, ChartSeriesPoint } from '@/contracts/chart';
import { D, decimalString, significantPrice } from '@/contracts/money';
import type { Showcase } from '@/ui/showcase/types';
import { FxChart } from '@/ui/chart/fx-chart';
import {
  APPROACHING,
  BOUNCE,
  DAY,
  HIT,
  JPY,
  JPY_SERIES,
  LIVE_SERIES,
  NOTIONAL,
  NOW,
  PAID,
  PAIR,
  SETTLED,
  WATCHING,
  baseOverlays,
  createEurMarket,
  referenceOf,
  seriesEnding,
} from '@/ui/chart/chart.fixtures';
import type { ChartType } from '@/ui/chart/chart-header';
import { useTimeFrozen } from '@/ui/motion/freeze';
import { Button } from '@/ui/primitives/button';

function useMarketIntervalMs(): number {
  const speed = useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
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

function Story({
  series,
  overlays,
  ...rest
}: Omit<ComponentProps<typeof FxChart>, 'range' | 'onRangeChange' | 'type' | 'onTypeChange'> & {
  series: ChartSeriesPoint[];
  overlays: ChartOverlays;
}) {
  const [range, setRange] = useState<ChartRange>('TO_DUE');
  const [type, setType] = useState<ChartType>('area');
  return (
    <FxChart
      series={series}
      overlays={overlays}
      range={range}
      onRangeChange={setRange}
      type={type}
      onTypeChange={setType}
      notional={NOTIONAL}
      connection="simulated"
      {...rest}
    />
  );
}

function LiveScenario() {
  const frozen = useTimeFrozen();
  const intervalMs = useMarketIntervalMs();
  const [series, setSeries] = useState(LIVE_SERIES);
  const [jumped, setJumped] = useState(false);
  const market = useRef<ReturnType<typeof createEurMarket> | null>(null);
  if (market.current == null) {
    market.current = createEurMarket();
  }
  useEffect(() => {
    if (frozen) return;
    const id = window.setInterval(() => {
      const tick = market.current?.step(NOW)[0];
      if (!tick) return;
      setSeries((current) => {
        const last = current[current.length - 1]?.time ?? NOW;
        return [...current, { time: last + 1, value: tick.price }];
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [frozen, intervalMs]);

  function nudge() {
    const price = market.current?.nudge('EUR', 'USD', -20);
    if (!price) return;
    setSeries((current) => {
      const last = current[current.length - 1]?.time ?? NOW;
      return [...current, { time: last + 1, value: price }];
    });
  }

  const deadline = NOW + 12 * DAY;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={nudge}>
          Nudge down 20 pips
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setJumped(true)}>
          Jump to deadline day
        </Button>
      </div>
      <Story
        pair={PAIR}
        series={series}
        reference={referenceOf(series.slice(-400))}
        overlays={baseOverlays(series, { now: jumped ? deadline : NOW, executionDeadline: deadline })}
      />
    </div>
  );
}

function easeInOut(ratio: number): string {
  const x = D(Math.min(1, Math.max(0, ratio)).toFixed(6));
  if (x.lte('0.5')) return decimalString(x.pow(3).mul('4'));
  const u = x.mul('-2').plus('2');
  return decimalString(D('1').minus(u.pow(3).div('2')));
}

// DEMO-ONLY: the kit replays the Simulate timeline in the browser.
// PROD: no simulate control; the chart only plots real ticks.
function SimulateScenario() {
  const frozen = useTimeFrozen();
  const base = seriesEnding('1.08800', 80);
  const [series, setSeries] = useState(base);
  const [phase, setPhase] = useState<'idle' | 'ramping' | 'hit' | 'executed'>('idle');
  const elapsed = useRef(0);
  const from = base[base.length - 1]?.value ?? '1.08800';
  const startTime = base[base.length - 1]?.time ?? NOW;

  useEffect(() => {
    if (frozen || phase === 'idle' || phase === 'executed') return;
    const id = window.setInterval(() => {
      elapsed.current += 200;
      const ms = elapsed.current;
      const ratio = Math.min(1, ms / 4000);
      const price = significantPrice(
        D(from).plus(D('1.074625').minus(D(from)).mul(easeInOut(ratio))),
      );
      const time = startTime + Math.max(1, Math.floor(ms / 200));
      setSeries((current) => {
        const last = current[current.length - 1];
        if (last?.time === time) return current.map((point, index) =>
          index === current.length - 1 ? { time, value: price } : point,
        );
        return [...current, { time, value: price }];
      });
      if (ms >= 5500) setPhase('executed');
      else if (ms >= 4000) setPhase('hit');
      else setPhase('ramping');
    }, 200);
    return () => window.clearInterval(id);
  }, [frozen, phase, from, startTime]);

  const simFrom = startTime + 1;
  const markers: ChartOverlays['markers'] = [
    { time: base[0]?.time ?? NOW, kind: 'ARMED' },
    { time: simFrom, kind: 'SIM_START' },
  ];
  if (phase === 'hit' || phase === 'executed') {
    markers.push({ time: startTime + 20, kind: 'TARGET_HIT' });
  }
  if (phase === 'executed') {
    markers.push({ time: startTime + 35, kind: 'EXECUTED' });
    markers.push({ time: startTime + 35, kind: 'SIM_END' });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => {
            elapsed.current = 0;
            setSeries(base);
            setPhase('ramping');
          }}
          disabled={phase !== 'idle' && phase !== 'executed'}
        >
          {phase === 'idle' ? 'Simulate target hit' : phase === 'executed' ? 'Simulate again' : 'Simulating'}
        </Button>
        <p className="text-fg-2">
          {phase === 'idle'
            ? 'Idle'
            : phase === 'ramping'
              ? 'Ramping into the target'
              : phase === 'hit'
                ? 'Target hit · paying'
                : 'Executed'}
        </p>
      </div>
      <Story
        pair={PAIR}
        series={series}
        targetPulse={phase === 'hit'}
        overlays={baseOverlays(series, {
          markers,
          simulatedRanges: phase === 'idle' ? [] : [{ from: simFrom, to: phase === 'executed' ? startTime + 35 : undefined }],
          quote:
            phase === 'hit'
              ? { price: '1.07420', from: startTime + 20, to: startTime + 20 + 60 }
              : undefined,
        })}
      />
    </div>
  );
}

const paidAt = PAID[PAID.length - 8]?.time ?? NOW;

export const chartScenarioShowcases: Showcase[] = [
  {
    id: 'scenario-watching',
    group: 'chart',
    title: 'Watching, far from target',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-watching-chart',
        title: 'Deadline 12 days out',
        render: () => (
          <Story
            pair={PAIR}
            series={WATCHING}
            reference={referenceOf(WATCHING)}
            overlays={baseOverlays(WATCHING)}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-approaching',
    group: 'chart',
    title: 'Approaching target',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-approaching-chart',
        title: 'Near-miss marker',
        render: () => (
          <Story
            pair={PAIR}
            series={APPROACHING}
            reference={referenceOf(APPROACHING)}
            overlays={baseOverlays(APPROACHING, {
              markers: [
                { time: APPROACHING[0]?.time ?? NOW, kind: 'ARMED' },
                { time: APPROACHING[APPROACHING.length - 3]?.time ?? NOW, kind: 'NEAR_MISS' },
              ],
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-hit',
    group: 'chart',
    title: 'Target hit',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-hit-chart',
        title: 'Quote band and countdown',
        render: () => (
          <Story
            pair={PAIR}
            series={HIT}
            reference={referenceOf(HIT)}
            targetPulse
            overlays={baseOverlays(HIT, {
              markers: [
                { time: HIT[0]?.time ?? NOW, kind: 'ARMED' },
                { time: HIT[HIT.length - 2]?.time ?? NOW, kind: 'TARGET_HIT' },
              ],
              quote: { price: '1.07420', from: NOW - 90, to: NOW + 14 * 60 },
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-rejected',
    group: 'chart',
    title: 'Near miss, still watching',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-rejected-chart',
        title: 'Price bounced, still watching',
        render: () => (
          <Story
            pair={PAIR}
            series={BOUNCE}
            reference={referenceOf(BOUNCE)}
            overlays={baseOverlays(BOUNCE, {
              markers: [
                { time: BOUNCE[0]?.time ?? NOW, kind: 'ARMED' },
                { time: BOUNCE[40]?.time ?? NOW, kind: 'NEAR_MISS' },
                { time: BOUNCE[48]?.time ?? NOW, kind: 'ARMED' },
              ],
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-final-day',
    group: 'chart',
    title: 'Deadline day',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-final-day-chart',
        title: 'Now on the deadline, pays at the cutoff',
        render: () => (
          <Story
            pair={PAIR}
            series={WATCHING}
            autosettleAt={new Date((NOW + 12 * DAY + 2 * 3600) * 1000).toISOString()}
            overlays={baseOverlays(WATCHING, {
              now: NOW + 12 * DAY,
              executionDeadline: NOW + 12 * DAY,
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-autosettle',
    group: 'chart',
    title: 'Deadline payment',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-autosettle-chart',
        title: 'Deadline payment marker',
        render: () => (
          <Story
            pair={PAIR}
            series={SETTLED}
            overlays={baseOverlays(SETTLED, {
              now: NOW + 12 * DAY,
              executionDeadline: NOW + 12 * DAY,
              markers: [
                { time: SETTLED[0]?.time ?? NOW, kind: 'ARMED' },
                { time: SETTLED[SETTLED.length - 1]?.time ?? NOW, kind: 'AUTOSETTLE' },
              ],
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-paid',
    group: 'chart',
    title: 'Paid',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-paid-chart',
        title: 'Executed marker, tail dimmed',
        render: () => (
          <Story
            pair={PAIR}
            series={PAID}
            overlays={baseOverlays(PAID, {
              markers: [
                { time: PAID[0]?.time ?? NOW, kind: 'ARMED' },
                { time: paidAt, kind: 'EXECUTED' },
              ],
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-max-cost',
    group: 'chart',
    title: 'Max-cost mode',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-max-cost-chart',
        title: 'Target label shows the cost',
        render: () => (
          <Story
            pair={PAIR}
            series={WATCHING}
            strategyMode="MAX_COST"
            maxCost="268,750.00 USD"
            overlays={baseOverlays(WATCHING)}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-inverted',
    group: 'chart',
    title: 'Inverted pair',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-inverted-chart',
        title: 'USD/JPY display for a JPY bill',
        render: () => (
          <Story
            pair={JPY}
            inverted
            series={JPY_SERIES}
            notional={{ amount: '8500000', currency: 'USD' }}
            overlays={baseOverlays(JPY_SERIES, { entry: '0.00710', target: '0.00650' })}
          />
        ),
      },
    ],
  },
  {
    id: 'scenario-no-reference',
    group: 'chart',
    title: 'No reference history',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-no-reference-chart',
        title: 'Own ticks only',
        render: () => (
          <Story pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} />
        ),
      },
    ],
  },
  {
    id: 'scenario-states',
    group: 'chart',
    title: 'Loading, empty, stale, error',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-states-chart',
        title: 'Chart states',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Story pair={PAIR} series={[]} overlays={baseOverlays(WATCHING)} state="loading" showHeader={false} />
            <Story pair={PAIR} series={[]} overlays={baseOverlays(WATCHING)} state="empty" showHeader={false} />
            <Story
              pair={PAIR}
              series={WATCHING}
              overlays={baseOverlays(WATCHING)}
              state="stale"
              showHeader={false}
            />
            <Story
              pair={PAIR}
              series={WATCHING}
              overlays={baseOverlays(WATCHING)}
              state="error"
              showHeader={false}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'scenario-live',
    group: 'chart',
    title: 'Live simulation',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-live-chart',
        title: 'Ticks every 500 ms',
        render: () => <LiveScenario />,
      },
    ],
  },
  {
    id: 'scenario-simulate',
    group: 'chart',
    title: 'Simulate run',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'scenario-simulate-chart',
        title: 'Ramp, target hit, executed',
        render: () => <SimulateScenario />,
      },
    ],
  },
];
