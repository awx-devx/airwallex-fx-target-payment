import { z } from 'zod';

export const healthCheckSchema = z.enum(['ok', 'down']);
export type HealthCheck = z.infer<typeof healthCheckSchema>;

export const healthFeedSchema = z.object({
  pair: z.string().min(1),
  ageMs: z.number().int().nullable(),
  fresh: z.boolean(),
});
export type HealthFeed = z.infer<typeof healthFeedSchema>;

export const healthQueueSchema = z.object({
  name: z.string().min(1),
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
});
export type HealthQueue = z.infer<typeof healthQueueSchema>;

export const healthReportSchema = z.object({
  ok: z.boolean(),
  checks: z.object({
    mongo: healthCheckSchema,
    redis: healthCheckSchema,
    worker: healthCheckSchema,
    airwallex: healthCheckSchema,
  }),
  workerAgeMs: z.number().int().nullable(),
  feeds: z.array(healthFeedSchema),
  queues: z.array(healthQueueSchema),
});
export type HealthReport = z.infer<typeof healthReportSchema>;
