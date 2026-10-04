import type { Redis } from 'ioredis';
import { appEventSchema, type AppEvent } from '@/contracts/sse';

export const APP_EVENTS_CHANNEL = 'app_events';

export function formatSseEvent(event: AppEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function formatSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

export async function publish(redis: Redis, event: AppEvent): Promise<void> {
  const parsed = appEventSchema.parse(event);
  await redis.publish(APP_EVENTS_CHANNEL, JSON.stringify(parsed));
}
