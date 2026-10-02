import { z } from 'zod';
import { decimalStringSchema } from '@/contracts/airwallex';

export const CHART_RANGES = ['1D', '5D', '1M', '3M', 'TO_DUE'] as const;
export const chartRangeSchema = z.enum(CHART_RANGES);
export type ChartRange = z.infer<typeof chartRangeSchema>;

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
});
export type ChartResponse = z.infer<typeof chartResponseSchema>;
