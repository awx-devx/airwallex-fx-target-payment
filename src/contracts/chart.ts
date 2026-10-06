import { z } from 'zod';
import { decimalStringSchema } from '@/contracts/airwallex';

export const CHART_RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', 'TO_DUE'] as const;
export const chartRangeSchema = z.enum(CHART_RANGES);
export type ChartRange = z.infer<typeof chartRangeSchema>;

/** Bar width in seconds. Intraday ranges share one step across the loaded history and the future axis. */
export const CHART_STEP_SEC: Record<ChartRange, number> = {
  '1D': 5 * 60,
  '5D': 15 * 60,
  '1M': 60 * 60,
  '3M': 86_400,
  '6M': 86_400,
  YTD: 86_400,
  '1Y': 86_400,
  TO_DUE: 60 * 60,
};

export const YAHOO_INTERVALS = ['5m', '15m', '1h'] as const;
export type YahooInterval = (typeof YAHOO_INTERVALS)[number];

/** Intraday ranges load more history than they show, so the chart can scroll back. */
export const CHART_INTRADAY: Partial<
  Record<ChartRange, { interval: YahooInterval; range: string }>
> = {
  '1D': { interval: '5m', range: '5d' },
  '5D': { interval: '15m', range: '1mo' },
  '1M': { interval: '1h', range: '6mo' },
  TO_DUE: { interval: '1h', range: '3mo' },
};

export const chartSeriesPointSchema = z.object({
  time: z.number().int(),
  value: decimalStringSchema,
});
export type ChartSeriesPoint = z.infer<typeof chartSeriesPointSchema>;

export const CHART_MARKER_KINDS = [
  'ARMED',
  'NEAR_MISS',
  'TARGET_HIT',
  'EXECUTED',
  'AUTOSETTLE',
  'SIM_START',
  'SIM_END',
] as const;
export const chartMarkerKindSchema = z.enum(CHART_MARKER_KINDS);
export type ChartMarkerKind = z.infer<typeof chartMarkerKindSchema>;

export const chartOverlaysSchema = z.object({
  entry: decimalStringSchema.optional(),
  target: decimalStringSchema.optional(),
  quote: z
    .object({
      price: decimalStringSchema,
      from: z.number().int(),
      to: z.number().int(),
    })
    .optional(),
  executionDeadline: z.number().int(),
  dueDate: z.number().int(),
  now: z.number().int(),
  markers: z.array(
    z.object({
      time: z.number().int(),
      kind: chartMarkerKindSchema,
      label: z.string().optional(),
    }),
  ),
  simulatedRanges: z
    .array(
      z.object({
        from: z.number().int(),
        to: z.number().int().optional(),
      }),
    )
    .optional(),
});
export type ChartOverlays = z.infer<typeof chartOverlaysSchema>;

export const chartResponseSchema = z.object({
  series: z.array(chartSeriesPointSchema),
  overlays: chartOverlaysSchema,
  reference: z.array(chartSeriesPointSchema).optional(),
  /** Seconds between bars. The client pads the future and snaps ticks onto this step. */
  step: z.number().int().positive(),
  /** Daily history could not be loaded. The chart waits instead of drawing ticks from this session. */
  historyPending: z.boolean().optional(),
});
export type ChartResponse = z.infer<typeof chartResponseSchema>;
