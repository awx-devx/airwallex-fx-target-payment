'use client';

import type { ChartOverlays, ChartRange, ChartSeriesPoint } from '@/contracts/chart';
import type { Pair, StrategyMode } from '@/contracts/bill';
import { roundToPayout } from '@/contracts/currencies';
import { D, decimalString } from '@/contracts/money';
import { favorable, formatMoney, formatPrice, priceFractionDigits } from '@/ui/format';
import { Skeleton } from '@/ui/primitives/skeleton';
import { ChartEmpty } from '@/ui/chart/chart-empty';
import { ChartHeader, type ChartType, type FeedState } from '@/ui/chart/chart-header';
import { CrosshairTooltip, DragPreview } from '@/ui/chart/crosshair-tooltip';
import { clusterMarkers, type PlotMarker } from '@/ui/chart/markers';
import { OverlayPrimitive, type OverlayModel } from '@/ui/chart/primitives/overlays';
import { candles, covers, linePoint, priceAt, type Span } from '@/ui/chart/plot';
import {
  canonicalFromChart,
  chartPrice,
  sameUtcDay,
  paddingTimes,
  seriesChange,
  seriesStep,
  visibleWindow,
  whitespaceEnd,
} from '@/ui/chart/scale';
import { readChartColors, withAlpha, type ChartColors } from '@/ui/chart/theme';
import { formatUtcDate } from '@/ui/trading/time-label';
import { Clock } from 'lucide-react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineWidth,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useKitReducedMotion, useTimeFrozen } from '@/ui/motion/freeze';
import { durTick } from '@/ui/tokens/motion';
import { cx } from '@/ui/primitives/cx';

export interface FxChartProps {
  pair: Pair;
  inverted?: boolean;
  series: ChartSeriesPoint[];
  reference?: ChartSeriesPoint[];
  overlays: ChartOverlays;
  strategyMode?: StrategyMode;
  range: ChartRange;
  type?: ChartType;
  height?: number | 'fill';
  state?: 'ready' | 'loading' | 'empty' | 'stale' | 'error';
  interactive?: boolean;
  onTargetDrag?: (price: string) => void;
  onRangeChange?: (range: ChartRange) => void;
  onTypeChange?: (type: ChartType) => void;
  connection?: FeedState;
  notional?: { amount: string; currency: string };
  quoteTone?: 'target' | 'deadline';
  targetPulse?: boolean;
  maxCost?: string;
  entryLabel?: boolean;
  showHeader?: boolean;
  autosettleAt?: string;
  errorMessage?: string;
  /** Selected bill, shown quietly in the header beside the market. */
  subject?: { vendor: string; amount: string; currency: string };
}

interface Handle {
  chart: IChartApi;
  kind: ChartType;
  main: ISeriesApi<'Area' | 'Line' | 'Candlestick'>;
  reference: ISeriesApi<'Line'> | null;
  simulated: ISeriesApi<'Line'> | null;
  tail: ISeriesApi<'Line'> | null;
  axis: ISeriesApi<'Line'> | null;
  overlay: OverlayPrimitive;
  markers: ISeriesMarkersPluginApi<Time>;
  entry: IPriceLine | null;
  target: IPriceLine | null;
}

export function FxChart(props: FxChartProps) {
  const {
    pair,
    inverted = false,
    series,
    reference,
    overlays,
    strategyMode,
    range,
    type = 'area',
    height = 320,
    state = 'ready',
    interactive = false,
    onTargetDrag,
    onRangeChange,
    onTypeChange,
    connection = 'live',
    notional,
    targetPulse = false,
    maxCost,
    entryLabel = true,
    showHeader = true,
    autosettleAt,
    errorMessage = "Couldn't load this chart.",
    subject,
  } = props;
  const reduced = useReducedMotion();
  const kitReduced = useKitReducedMotion();
  const frozen = useTimeFrozen();
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const previous = useRef<ChartSeriesPoint[]>([]);
  const windowKey = useRef('');
  const axisKey = useRef('');
  const [tip, setTip] = useState<{ x: number; y: number; price: string; time: string } | null>(
    null,
  );
  const [drag, setDrag] = useState<{ x: number; y: number; price: string } | null>(null);
  const dragPrice = drag?.price;
  const target = dragPrice ?? overlays.target;
  const nowIso = unixIso(overlays.now);
  const latest = useRef({
    series,
    overlays,
    pair,
    inverted,
    target,
    interactive,
    onTargetDrag,
  });
  useEffect(() => {
    const node = host.current;
    if (!node || state === 'loading' || state === 'empty') return;
    const colors = readChartColors();
    const chart = createChart(node, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.fg2,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: colors.line1 },
      },
      rightPriceScale: { borderColor: colors.line2 },
      timeScale: { borderColor: colors.line2, rightOffset: 8, timeVisible: true, minBarSpacing: 6 },
      crosshair: {
        vertLine: { color: colors.line3, labelBackgroundColor: colors.bg0 },
        horzLine: { color: colors.line3, labelBackgroundColor: colors.bg0 },
      },
      handleScroll: true,
      handleScale: true,
    });
    const main = addMain(chart, 'area', colors, 5);
    const overlay = new OverlayPrimitive(blankModel(colors));
    main.attachPrimitive(overlay);
    const markers = createSeriesMarkers(main, []);
    handle.current = {
      chart,
      kind: 'area',
      main,
      reference: null,
      simulated: null,
      tail: null,
      axis: null,
      overlay,
      markers,
      entry: null,
      target: null,
    };
    const onMove = (param: MouseEventParams<Time>) => {
      const current = latest.current;
      const point = param.point;
      const time = typeof param.time === 'number' ? param.time : null;
      if (!point || time === null) {
        setTip(null);
        return;
      }
      const price = priceAt(current.series, time);
      if (!price) {
        setTip(null);
        return;
      }
      setTip({
        x: point.x,
        y: point.y,
        price,
        time: formatUtcDate(unixIso(time), 'day-time'),
      });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      handle.current = null;
      previous.current = [];
      windowKey.current = '';
      axisKey.current = '';
    };
  }, [state]);

  useEffect(() => {
    const api = handle.current;
    const node = host.current;
    if (!api || !node || state === 'loading' || state === 'empty') return;
    latest.current = { series, overlays, pair, inverted, target, interactive, onTargetDrag };
    const colors = readChartColors();
    const digits = priceFractionDigits(inverted ? pair.base : pair.quote);
    if (api.kind !== type) {
      api.chart.removeSeries(api.main);
      if (api.reference) api.chart.removeSeries(api.reference);
      if (api.simulated) api.chart.removeSeries(api.simulated);
      if (api.tail) api.chart.removeSeries(api.tail);
      // The price scale takes its grid step from the oldest series. Drop the
      // whitespace axis so the new price series is that series, then rebuild it.
      if (api.axis) {
        api.chart.removeSeries(api.axis);
        api.axis = null;
        axisKey.current = '';
      }
      const main = addMain(api.chart, type, colors, digits);
      const overlay = new OverlayPrimitive(blankModel(colors));
      main.attachPrimitive(overlay);
      api.main = main;
      api.overlay = overlay;
      api.markers = createSeriesMarkers(main, []);
      api.reference = null;
      api.simulated = null;
      api.tail = null;
      api.entry = null;
      api.target = null;
      api.kind = type;
      previous.current = [];
    }
    const change = seriesChange(previous.current, series);
    const spans = overlays.simulatedRanges ?? [];
    const executedAt = overlays.markers.find((marker) => marker.kind === 'EXECUTED')?.time;
    const first = series[0]?.time ?? overlays.now;
    const lastTime = series[series.length - 1]?.time ?? first;
    const end = Math.max(whitespaceEnd(first, overlays.dueDate), lastTime + 1);
    const pad = paddingTimes(lastTime, end, seriesStep(series), [
      overlays.executionDeadline,
      overlays.dueDate,
      overlays.now,
      overlays.quote?.from ?? 0,
      overlays.quote?.to ?? 0,
      ...(overlays.simulatedRanges ?? []).flatMap((span) =>
        span.to === undefined ? [span.from] : [span.from, span.to],
      ),
    ]);
    const nextAxis = pad.join(',');
    if (axisKey.current !== nextAxis) {
      axisKey.current = nextAxis;
      syncAxis(api, pad, digits);
    }
    if (change === 'update' && type !== 'candles') {
      const last = series[series.length - 1];
      if (last && !covers(last.time, spans) && !(executedAt && last.time > executedAt)) {
        api.main.update(linePoint(last, inverted));
      } else if (last) {
        replaceSeries(api, series, inverted, type, spans, executedAt, colors);
      }
    } else if (change !== 'same') {
      replaceSeries(api, series, inverted, type, spans, executedAt, colors);
    }
    previous.current = series;
    syncReference(api, reference, inverted, colors);
    syncLines(api, {
      colors,
      inverted,
      pair,
      entry: overlays.entry,
      target,
      entryLabel,
      strategyMode,
      maxCost,
      targetPulse,
      digits,
    });
    api.overlay.apply({
      ...overlayModel({
        colors,
        inverted,
        overlays,
        target,
      }),
      pulse: api.overlay.model.pulse,
    });
    const view = visibleWindow(range, overlays.now, first, overlays.dueDate);
    const nextWindow = `${view.from}:${view.to}`;
    if (windowKey.current !== nextWindow) {
      windowKey.current = nextWindow;
      try {
        api.chart.timeScale().setVisibleRange({
          from: view.from as UTCTimestamp,
          to: view.to as UTCTimestamp,
        });
      } catch {
        api.chart.timeScale().fitContent();
      }
    }
    const plotted: PlotMarker[] = overlays.markers.flatMap((marker) => {
      const value = priceAt(series, marker.time);
      if (!value) return [];
      return [
        {
          time: marker.time,
          kind: marker.kind,
          price: chartPrice(value, inverted),
          text: marker.label ?? '',
        },
      ];
    });
    const placeMarkers = () => {
      if (handle.current !== api) return;
      const clustered = clusterMarkers(plotted, (time) => api.overlay.x(time));
      api.markers.setMarkers(
        clustered.map((marker) => ({
          time: marker.time as UTCTimestamp,
          position: 'atPriceMiddle' as const,
          price: marker.price,
          shape: marker.kind === 'NEAR_MISS' ? ('square' as const) : ('circle' as const),
          color:
            marker.kind === 'TARGET_HIT' && targetPulse ? colors.orange300 : markerColor(marker.kind, colors),
          text: marker.text,
          size: marker.kind === 'TARGET_HIT' ? (targetPulse ? 3 : 2) : 1,
        })),
      );
    };
    placeMarkers();
    const markerFrame = window.requestAnimationFrame(placeMarkers);
    const last = series[series.length - 1];
    const prior = series[series.length - 2];
    if (last) {
      const delta = overlays.entry
        ? decimalString(D(last.value).minus(D(overlays.entry)))
        : prior
          ? decimalString(D(last.value).minus(D(prior.value)))
          : '0';
      const direction = favorable(delta);
      api.main.applyOptions({
        priceLineVisible: true,
        lastValueVisible: true,
        priceLineColor:
          direction === 'favorable' ? colors.up : direction === 'adverse' ? colors.down : colors.fg2,
      });
    }
    return () => window.cancelAnimationFrame(markerFrame);
  }, [
    entryLabel,
    interactive,
    inverted,
    maxCost,
    onTargetDrag,
    overlays,
    pair,
    range,
    series,
    reference,
    state,
    strategyMode,
    target,
    targetPulse,
    type,
  ]);

  useEffect(() => {
    const api = handle.current;
    if (!api) return;
    if (!targetPulse || reduced || kitReduced || frozen) {
      if (api.overlay.model.pulse) api.overlay.apply({ ...api.overlay.model, pulse: 0 });
      return;
    }
    let frame = 0;
    const started = performance.now();
    const duration = durTick * 1000;
    const step = (now: number) => {
      const current = handle.current;
      if (!current) return;
      const progress = Math.min(1, (now - started) / duration);
      current.overlay.apply({ ...current.overlay.model, pulse: 1 - progress });
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [frozen, kitReduced, reduced, targetPulse]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const api = handle.current;
    const current = latest.current;
    if (!api || !current.interactive || !current.target) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - bounds.top;
    const line = api.main.priceToCoordinate(chartPrice(current.target, current.inverted));
    if (line === null || Math.abs(y - line) > 10) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer can already be gone; the drag still tracks move and up.
    }
    api.chart.applyOptions({ handleScroll: false, handleScale: false });
    setDrag({ x: event.clientX - bounds.left, y, price: current.target });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const api = handle.current;
    if (!api) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - bounds.top;
    const displayed = api.main.coordinateToPrice(y);
    if (displayed === null) return;
    const price = canonicalFromChart(displayed, inverted);
    setDrag({ x: event.clientX - bounds.left, y, price });
  }

  function onPointerUp() {
    const api = handle.current;
    if (!drag) return;
    api?.chart.applyOptions({ handleScroll: true, handleScale: true });
    onTargetDrag?.(drag.price);
    setDrag(null);
  }

  const lastPoint = series[series.length - 1];
  const last = lastPoint?.value;
  const priceSimulated =
    lastPoint !== undefined && covers(lastPoint.time, overlays.simulatedRanges ?? []);
  const fill = height === 'fill';
  const cost = (price: string) =>
    notional
      ? formatMoney(
          notional.currency,
          roundToPayout(notional.currency, decimalString(D(notional.amount).mul(D(price)))),
        )
      : undefined;

  return (
    <div className={cx('flex min-h-0 flex-col gap-3', fill && 'h-full')}>
      {showHeader ? (
        <ChartHeader
          pair={pair}
          price={state === 'empty' ? undefined : last}
          entry={overlays.entry}
          inverted={inverted}
          stale={state === 'stale'}
          connection={
            priceSimulated ? 'simulated' : state === 'stale' ? 'delayed' : connection
          }
          range={range}
          onRangeChange={(next) => onRangeChange?.(next)}
          type={type}
          onTypeChange={(next) => onTypeChange?.(next)}
          autosettleAt={autosettleAt}
          now={nowIso}
          subject={subject}
        />
      ) : null}
      {state === 'loading' ? (
        <Skeleton variant="chart" className={fill ? 'h-full min-h-0 flex-1' : 'w-full'} />
      ) : state === 'empty' ? (
        <div className={fill ? 'min-h-0 flex-1' : undefined} style={fill ? undefined : { height }}>
          <ChartEmpty />
        </div>
      ) : (
        <div
          className={cx('relative min-h-0', fill ? 'flex-1' : undefined, state === 'stale' && 'opacity-60')}
          style={fill ? undefined : { height }}
          onPointerDownCapture={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div
            ref={host}
            className="absolute inset-0"
            role="img"
            aria-label={`${pair.base}/${pair.quote} chart`}
          />
          {state === 'stale' ? (
            <p className="absolute top-2 left-2 inline-flex items-center gap-1 text-fg-3">
              <Clock strokeWidth={1.5} className="size-3.5" aria-hidden />
              Stale
            </p>
          ) : null}
          {state === 'error' ? (
            <p className="absolute inset-x-0 top-2 text-center text-down">{errorMessage}</p>
          ) : null}
          {tip && !drag ? (
            <div className="absolute z-10" style={{ left: tip.x + 12, top: tip.y + 12 }}>
              <CrosshairTooltip
                pair={pair}
                price={tip.price}
                inverted={inverted}
                entry={overlays.entry}
                target={overlays.target}
                timeLabel={tip.time}
                notional={notional}
              />
            </div>
          ) : null}
          {drag ? (
            <div className="absolute z-10" style={{ left: drag.x + 12, top: drag.y - 36 }}>
              <DragPreview
                pair={pair}
                price={drag.price}
                inverted={inverted}
                cost={cost(drag.price)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function addMain(
  chart: IChartApi,
  type: ChartType,
  colors: ChartColors,
  digits: number,
): ISeriesApi<'Area' | 'Line' | 'Candlestick'> {
  const priceFormat = {
    type: 'price' as const,
    precision: digits,
    minMove: 10 ** -digits,
  };
  if (type === 'line') {
    return chart.addSeries(LineSeries, {
      color: colors.fg1,
      lineWidth: 2,
      priceLineVisible: true,
      priceFormat,
    });
  }
  if (type === 'candles') {
    return chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceLineVisible: true,
      priceFormat,
    });
  }
  return chart.addSeries(AreaSeries, {
    lineColor: colors.fg1,
    lineWidth: 2,
    topColor: withAlpha(colors.fg1, 0.1),
    bottomColor: withAlpha(colors.fg1, 0),
    priceLineVisible: true,
    priceFormat,
  });
}

function syncAxis(api: Handle, times: readonly number[], digits: number): void {
  const data = times.map((time) => ({ time: time as UTCTimestamp }));
  if (!api.axis) {
    api.axis = api.chart.addSeries(LineSeries, {
      color: 'transparent',
      lineVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'price',
        precision: digits,
        minMove: 10 ** -digits,
      },
    });
  }
  api.axis.setData(data);
}

function replaceSeries(
  api: Handle,
  series: readonly ChartSeriesPoint[],
  inverted: boolean,
  type: ChartType,
  spans: readonly Span[],
  executedAt: number | undefined,
  colors: ChartColors,
): void {
  const mainPoints = series.filter(
    (point) => !covers(point.time, spans) && !(executedAt && point.time > executedAt),
  );
  const simPoints = series.filter((point) => covers(point.time, spans));
  const tailPoints = executedAt
    ? series.filter((point) => point.time >= executedAt)
    : [];
  if (type === 'candles') {
    api.main.setData(candles(mainPoints.length > 0 ? mainPoints : series, inverted));
  } else {
    api.main.setData(
      (mainPoints.length > 0 ? mainPoints : series).map((point) => linePoint(point, inverted)),
    );
  }
  api.simulated = lineSeries(
    api,
    'simulated',
    api.simulated,
    simPoints.map((point) => linePoint(point, inverted)),
    {
      color: colors.orange300,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    },
  );
  api.tail = lineSeries(
    api,
    'tail',
    api.tail,
    tailPoints.map((point) => linePoint(point, inverted)),
    {
      color: withAlpha(colors.fg1, 0.4),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    },
  );
}

function syncReference(
  api: Handle,
  reference: readonly ChartSeriesPoint[] | undefined,
  inverted: boolean,
  colors: ChartColors,
): void {
  api.reference = lineSeries(
    api,
    'reference',
    api.reference,
    (reference ?? []).map((point) => linePoint(point, inverted)),
    {
      color: withAlpha(colors.info, 0.4),
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: 'Reference (ECB)',
      priceLineVisible: false,
      lastValueVisible: false,
    },
  );
}

function lineSeries(
  api: Handle,
  _name: string,
  current: ISeriesApi<'Line'> | null,
  data: { time: UTCTimestamp; value: number }[],
  options: {
    color: string;
    lineWidth: LineWidth;
    lineStyle?: LineStyle;
    title?: string;
    priceLineVisible: boolean;
    lastValueVisible: boolean;
  },
): ISeriesApi<'Line'> | null {
  if (data.length === 0) {
    if (current) api.chart.removeSeries(current);
    return null;
  }
  const series = current ?? api.chart.addSeries(LineSeries, options);
  if (current) series.applyOptions(options);
  series.setData(data);
  return series;
}

function syncLines(
  api: Handle,
  input: {
    colors: ChartColors;
    inverted: boolean;
    pair: Pair;
    entry?: string;
    target?: string;
    entryLabel: boolean;
    strategyMode?: StrategyMode;
    maxCost?: string;
    targetPulse: boolean;
    digits: number;
  },
): void {
  api.entry = priceLine(api, 'entry', api.entry, input.entry, input.inverted, {
    color: input.colors.info,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: input.entryLabel,
    title: input.entry
      ? `ENTRY ${formatPrice(input.pair, input.entry, { inverted: input.inverted })}`
      : '',
    axisLabelColor: input.colors.info,
    axisLabelTextColor: input.colors.bg0,
  });
  const title =
    input.strategyMode === 'MAX_COST' && input.target && input.maxCost
      ? `MAX COST ≙ ${formatPrice(input.pair, input.target, { inverted: input.inverted })} · ${input.maxCost}`
      : input.target
        ? `TARGET ${formatPrice(input.pair, input.target, { inverted: input.inverted })}`
        : '';
  api.target = priceLine(api, 'target', api.target, input.target, input.inverted, {
    color: input.targetPulse ? input.colors.orange300 : input.colors.orange,
    lineWidth: input.targetPulse ? 3 : 2,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title,
    axisLabelColor: input.colors.orange,
    axisLabelTextColor: input.colors.bg0,
  });
  void input.digits;
}

function priceLine(
  api: Handle,
  _name: string,
  current: IPriceLine | null,
  value: string | undefined,
  inverted: boolean,
  options: {
    color: string;
    lineWidth: LineWidth;
    lineStyle: LineStyle;
    axisLabelVisible: boolean;
    title: string;
    axisLabelColor: string;
    axisLabelTextColor: string;
  },
): IPriceLine | null {
  if (!value) {
    if (current) api.main.removePriceLine(current);
    return null;
  }
  const price = chartPrice(value, inverted);
  if (!current) return api.main.createPriceLine({ ...options, price });
  current.applyOptions({ ...options, price });
  return current;
}

function overlayModel(input: {
  colors: ChartColors;
  inverted: boolean;
  overlays: ChartOverlays;
  target?: string;
}): OverlayModel {
  const { colors, overlays, inverted } = input;
  const spans = (overlays.simulatedRanges ?? []).map((span) => ({
    from: span.from,
    to: span.to ?? overlays.now,
  }));
  return {
    inverted,
    target: input.target ? chartPrice(input.target, inverted) : undefined,
    entry: overlays.entry ? chartPrice(overlays.entry, inverted) : undefined,
    zone: Boolean(input.target),
    deadline: overlays.executionDeadline,
    due: overlays.dueDate,
    now: overlays.now,
    deadlineLabel: `EXECUTE BY · ${formatUtcDate(unixIso(overlays.executionDeadline))}`,
    dueLabel: `DUE · ${formatUtcDate(unixIso(overlays.dueDate))}`,
    deadlineToday: sameUtcDay(overlays.now, overlays.executionDeadline),
    deadlinePassed: overlays.now > overlays.executionDeadline,
    dueToday: sameUtcDay(overlays.now, overlays.dueDate),
    simulated: spans,
    colors,
  };
}

function blankModel(colors: ChartColors): OverlayModel {
  return {
    inverted: false,
    zone: false,
    deadline: 0,
    due: 0,
    now: 0,
    deadlineLabel: '',
    dueLabel: '',
    deadlineToday: false,
    deadlinePassed: false,
    dueToday: false,
    simulated: [],
    colors,
  };
}

function markerColor(kind: PlotMarker['kind'], colors: ChartColors): string {
  switch (kind) {
    case 'ARMED':
      return colors.info;
    case 'NEAR_MISS':
    case 'AUTOSETTLE':
      return colors.warn;
    case 'TARGET_HIT':
    case 'SIM_START':
      return colors.orange;
    case 'EXECUTED':
      return colors.up;
    case 'SIM_END':
      return colors.fg3;
    default:
      return colors.fg2;
  }
}

function unixIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}
