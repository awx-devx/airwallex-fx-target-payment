'use client';

import { useState, type ComponentProps } from 'react';
import type { ChartRange } from '@/contracts/chart';
import type { Showcase } from '@/ui/showcase/types';
import { ChartHeader, type ChartType } from '@/ui/chart/chart-header';
import { CrosshairTooltip, DragPreview } from '@/ui/chart/crosshair-tooltip';
import { FxChart } from '@/ui/chart/fx-chart';
import {
  APPROACHING,
  DAY,
  HIT,
  JPY,
  JPY_SERIES,
  NOTIONAL,
  NOW,
  NOW_ISO,
  PAIR,
  WATCHING,
  baseOverlays,
} from '@/ui/chart/chart.fixtures';
import { RangeSwitcher } from '@/ui/chart/range-switcher';
import { Cell, Matrix } from '@/ui/primitives/showcase/frame';

function Mini(
  props: Omit<ComponentProps<typeof FxChart>, 'range' | 'showHeader'> & { range?: ChartRange },
) {
  const [range, setRange] = useState<ChartRange>(props.range ?? 'TO_DUE');
  const [type, setType] = useState<ChartType>(props.type ?? 'area');
  return (
    <FxChart
      {...props}
      range={range}
      type={type}
      onRangeChange={setRange}
      onTypeChange={setType}
      showHeader={false}
      height={200}
    />
  );
}

function DragTarget() {
  const [target, setTarget] = useState('1.07500');
  const series = WATCHING;
  return (
    <FxChart
      pair={PAIR}
      series={series}
      overlays={baseOverlays(series, { target })}
      range="TO_DUE"
      onRangeChange={() => undefined}
      interactive
      onTargetDrag={setTarget}
      notional={NOTIONAL}
      height={240}
      showHeader={false}
    />
  );
}

export const chartPartShowcases: Showcase[] = [
  {
    id: 'chart-header',
    group: 'chart',
    title: 'ChartHeader',
    importPath: '@/ui/chart/chart-header',
    sections: [
      {
        id: 'chart-header-matrix',
        title: 'Pair, price, range, type',
        render: () => <HeaderDemo />,
      },
    ],
  },
  {
    id: 'range-switcher',
    group: 'chart',
    title: 'RangeSwitcher',
    importPath: '@/ui/chart/range-switcher',
    sections: [
      {
        id: 'range-switcher-matrix',
        title: '1D through to due',
        render: () => <RangeDemo />,
      },
    ],
  },
  {
    id: 'crosshair-tooltip',
    group: 'chart',
    title: 'CrosshairTooltip',
    importPath: '@/ui/chart/crosshair-tooltip',
    sections: [
      {
        id: 'crosshair-tooltip-matrix',
        title: 'Price, deltas, cost, drag preview',
        render: () => (
          <Matrix>
            <CrosshairTooltip
              pair={PAIR}
              price="1.08425"
              entry="1.09400"
              target="1.07500"
              timeLabel="1 Oct 12:00"
              notional={NOTIONAL}
            />
            <DragPreview pair={PAIR} price="1.07500" cost="268,750.00 USD" />
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'entry-line',
    group: 'chart',
    title: 'EntryLine',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'entry-line-matrix',
        title: 'Label, no label, inverted',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-3">
            <Cell label="label">
              <Mini pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} />
            </Cell>
            <Cell label="no label">
              <Mini pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} entryLabel={false} />
            </Cell>
            <Cell label="inverted">
              <Mini
                pair={JPY}
                inverted
                series={JPY_SERIES}
                overlays={baseOverlays(JPY_SERIES, { entry: '0.00710', target: '0.00650' })}
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'target-line',
    group: 'chart',
    title: 'TargetLine',
    importPath: '@/ui/chart/fx-chart',
    sections: [
      {
        id: 'target-line-matrix',
        title: 'Idle, hit pulse, max cost, dragging',
        render: () => (
          <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Cell label="idle">
                <Mini pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} />
              </Cell>
              <Cell label="just hit">
                <Mini pair={PAIR} series={HIT} overlays={baseOverlays(HIT)} targetPulse />
              </Cell>
              <Cell label="max cost">
                <Mini
                  pair={PAIR}
                  series={WATCHING}
                  overlays={baseOverlays(WATCHING)}
                  strategyMode="MAX_COST"
                  maxCost="268,750.00 USD"
                />
              </Cell>
            </div>
            <Cell label="drag the target">
              <DragTarget />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'target-zone',
    group: 'chart',
    title: 'TargetZone',
    importPath: '@/ui/chart/primitives/overlays',
    sections: [
      {
        id: 'target-zone-matrix',
        title: 'Below the target, flipped when inverted',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Cell label="on">
              <Mini pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} />
            </Cell>
            <Cell label="inverted">
              <Mini
                pair={JPY}
                inverted
                series={JPY_SERIES}
                overlays={baseOverlays(JPY_SERIES, { entry: '0.00710', target: '0.00650' })}
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'quote-band',
    group: 'chart',
    title: 'QuoteBand',
    importPath: '@/ui/chart/primitives/overlays',
    sections: [
      {
        id: 'quote-band-matrix',
        title: 'Target, deadline, expiring, expired',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Cell label="target">
              <Mini
                pair={PAIR}
                series={HIT}
                overlays={baseOverlays(HIT, {
                  quote: { price: '1.07420', from: NOW - 120, to: NOW + 14 * 60 },
                })}
              />
            </Cell>
            <Cell label="deadline">
              <Mini
                pair={PAIR}
                series={APPROACHING}
                quoteTone="deadline"
                overlays={baseOverlays(APPROACHING, {
                  now: NOW + 12 * DAY,
                  executionDeadline: NOW + 12 * DAY,
                  quote: { price: '1.08600', from: NOW + 12 * DAY - 60, to: NOW + 12 * DAY + 20 * 60 },
                })}
              />
            </Cell>
            <Cell label="expiring">
              <Mini
                pair={PAIR}
                series={HIT}
                overlays={baseOverlays(HIT, {
                  quote: { price: '1.07420', from: NOW - 30, to: NOW + 40 },
                })}
              />
            </Cell>
            <Cell label="expired">
              <Mini
                pair={PAIR}
                series={HIT}
                overlays={baseOverlays(HIT, {
                  quote: { price: '1.07420', from: NOW - 600, to: NOW - 60 },
                })}
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'deadline-line',
    group: 'chart',
    title: 'DeadlineLine',
    importPath: '@/ui/chart/primitives/overlays',
    sections: [
      {
        id: 'deadline-line-matrix',
        title: 'Normal, today, passed',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-3">
            <Cell label="normal">
              <Mini pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} />
            </Cell>
            <Cell label="today">
              <Mini
                pair={PAIR}
                series={WATCHING}
                overlays={baseOverlays(WATCHING, {
                  now: NOW + 12 * DAY,
                  executionDeadline: NOW + 12 * DAY,
                })}
              />
            </Cell>
            <Cell label="passed">
              <Mini
                pair={PAIR}
                series={WATCHING}
                overlays={baseOverlays(WATCHING, {
                  now: NOW + 13 * DAY,
                  executionDeadline: NOW + 12 * DAY,
                })}
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'due-date-line',
    group: 'chart',
    title: 'DueDateLine',
    importPath: '@/ui/chart/primitives/overlays',
    sections: [
      {
        id: 'due-line-matrix',
        title: 'Normal and today',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Cell label="normal">
              <Mini pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} />
            </Cell>
            <Cell label="today">
              <Mini
                pair={PAIR}
                series={WATCHING}
                overlays={baseOverlays(WATCHING, { now: NOW + 16 * DAY, dueDate: NOW + 16 * DAY })}
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'now-line',
    group: 'chart',
    title: 'NowLine',
    importPath: '@/ui/chart/primitives/overlays',
    sections: [
      {
        id: 'now-line-matrix',
        title: 'Dotted line at now',
        render: () => <Mini pair={PAIR} series={WATCHING} overlays={baseOverlays(WATCHING)} />,
      },
    ],
  },
  {
    id: 'event-markers',
    group: 'chart',
    title: 'EventMarkers',
    importPath: '@/ui/chart/markers',
    sections: [
      {
        id: 'event-markers-matrix',
        title: 'Every kind, plus a cluster',
        render: () => <MarkerCharts />,
      },
    ],
  },
  {
    id: 'simulated-segment',
    group: 'chart',
    title: 'SimulatedSegment',
    importPath: '@/ui/chart/primitives/overlays',
    sections: [
      {
        id: 'simulated-segment-matrix',
        title: 'Closed and still running',
        render: () => <SimulatedCharts />,
      },
    ],
  },
];

function HeaderDemo() {
  const [range, setRange] = useState<ChartRange>('TO_DUE');
  const [type, setType] = useState<ChartType>('area');
  return (
    <ChartHeader
      pair={PAIR}
      price="1.08425"
      entry="1.09400"
      connection="simulated"
      range={range}
      onRangeChange={setRange}
      type={type}
      onTypeChange={setType}
      autosettleAt="2026-10-01T14:00:00.000Z"
      now={NOW_ISO}
    />
  );
}

function RangeDemo() {
  const [range, setRange] = useState<ChartRange>('1D');
  return <RangeSwitcher value={range} onValueChange={setRange} />;
}

function MarkerCharts() {
  const series = WATCHING;
  const times = [0.12, 0.24, 0.36, 0.48, 0.62, 0.76, 0.9].map((fraction) => {
    const index = Math.min(series.length - 1, Math.round(fraction * (series.length - 1)));
    return series[index]?.time ?? NOW;
  });
  const kinds = [
    'ARMED',
    'NEAR_MISS',
    'TARGET_HIT',
    'EXECUTED',
    'AUTOSETTLE',
    'SIM_START',
    'SIM_END',
  ] as const;
  const clusterTime = series[40]?.time ?? NOW;
  return (
    <div className="grid gap-4">
      <Mini
        pair={PAIR}
        series={series}
        overlays={baseOverlays(series, {
          markers: kinds.map((kind, index) => ({
            time: times[index] ?? NOW,
            kind,
          })),
        })}
      />
      <Cell label="cluster">
        <Mini
          pair={PAIR}
          series={series}
          overlays={baseOverlays(series, {
            markers: [
              { time: clusterTime, kind: 'NEAR_MISS' },
              { time: clusterTime + 60, kind: 'TARGET_HIT' },
              { time: clusterTime + 120, kind: 'EXECUTED' },
            ],
          })}
        />
      </Cell>
    </div>
  );
}

function SimulatedCharts() {
  const series = WATCHING;
  const mid = series[Math.floor(series.length / 2)]?.time ?? NOW;
  const later = series[series.length - 20]?.time ?? NOW;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Cell label="closed">
        <Mini
          pair={PAIR}
          series={series}
          overlays={baseOverlays(series, {
            simulatedRanges: [{ from: mid, to: later }],
            markers: [
              { time: mid, kind: 'SIM_START' },
              { time: later, kind: 'SIM_END' },
            ],
          })}
        />
      </Cell>
      <Cell label="running">
        <Mini
          pair={PAIR}
          series={series}
          overlays={baseOverlays(series, {
            simulatedRanges: [{ from: later }],
            markers: [{ time: later, kind: 'SIM_START' }],
          })}
        />
      </Cell>
    </div>
  );
}
