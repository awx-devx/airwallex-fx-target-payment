import type { Redis } from 'ioredis';
import { appEventSchema, type AppEvent } from '@/contracts/sse';

export const APP_EVENTS_CHANNEL = 'app_events';

/** Vitest workers share Redis, so each one gets its own channel. */
export function appEventsChannel(): string {
  const worker = process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID;
  return process.env.VITEST === 'true' && worker
    ? `${APP_EVENTS_CHANNEL}:${worker}`
    : APP_EVENTS_CHANNEL;
}

export function formatSseEvent(event: AppEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function formatSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

export async function publish(redis: Redis, event: AppEvent): Promise<void> {
  const parsed = appEventSchema.parse(event);
  await redis.publish(appEventsChannel(), JSON.stringify(parsed));
}
