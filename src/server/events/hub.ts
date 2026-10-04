import { appEventSchema, type AppEvent } from '@/contracts/sse';
import { Redis } from 'ioredis';
import {
  APP_EVENTS_CHANNEL,
  formatSseComment,
  formatSseEvent,
} from '@/server/events/bus';
import type { AppLogger } from '@/server/logging/logger';
import { getLogger } from '@/server/logging/logger';

type Listener = (event: AppEvent) => void;

/**
 * One Redis subscriber per process. SSE responses listen here and fan out in memory.
 */
export class EventHub {
  private subscriber: Redis | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly logger: AppLogger) {}

  get subscriberConnections(): number {
    return this.subscriber ? 1 : 0;
  }

  async start(url: string): Promise<void> {
    if (this.subscriber) return;
    const subscriber = new Redis(url, { maxRetriesPerRequest: null });
    subscriber.on('message', (_channel, message) => {
      this.dispatch(message);
    });
    await subscriber.subscribe(APP_EVENTS_CHANNEL);
    this.subscriber = subscriber;
  }

  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async stop(): Promise<void> {
    this.listeners.clear();
    const subscriber = this.subscriber;
    this.subscriber = null;
    if (subscriber) await subscriber.quit();
  }

  private dispatch(message: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      this.logger.warn({ err: error }, 'dropped app event');
      return;
    }
    const event = appEventSchema.safeParse(parsed);
    if (!event.success) {
      this.logger.warn({ err: event.error }, 'dropped app event');
      return;
    }
    for (const listener of this.listeners) listener(event.data);
  }
}

let hub: EventHub | undefined;

export function getEventHub(): EventHub {
  hub ??= new EventHub(getLogger());
  return hub;
}

export async function resetEventHub(): Promise<void> {
  await hub?.stop();
  hub = undefined;
}

/** A non-positive desired size means the client is behind. Drop the event. */
export function dropForBackpressure(desiredSize: number | null): boolean {
  return desiredSize !== null && desiredSize <= 0;
}

export function openEventStream(options: {
  hub: EventHub;
  signal: AbortSignal;
  heartbeatMs?: number;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  return new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (options.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = options.hub.listen((event) => {
        if (dropForBackpressure(controller.desiredSize)) return;
        send(formatSseEvent(event));
      });
      const heartbeat = setInterval(() => {
        send(formatSseComment('ping'));
      }, heartbeatMs);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        options.signal.removeEventListener('abort', cleanup);
      };
      options.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // The client already went away.
        }
      });
    },
  });
}
