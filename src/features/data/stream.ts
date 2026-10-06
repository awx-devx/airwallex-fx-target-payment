import { appEventSchema, type AppEvent } from '@/contracts/sse';

const EVENT_TYPES = [
  'tick',
  'bill.updated',
  'execution.updated',
  'notification',
  'clock',
  'hello',
  'demo.sim',
  'extraction.progress',
] as const;

export type StreamStatus = 'live' | 'delayed' | 'offline';

type EventSourceLike = {
  close: () => void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
};

/**
 * SSE client for `/api/stream`. Native auto-reconnect is disabled so the
 * backoff is ours. After repeated failures the caller is asked to poll.
 */
export function connectStream(options: {
  onEvent: (event: AppEvent) => void;
  onStatus: (status: StreamStatus) => void;
  onPoll: () => void;
  url?: string;
  EventSource?: new (url: string) => EventSourceLike;
  pollMs?: number;
}): () => void {
  const Source = options.EventSource ?? (globalThis.EventSource as new (url: string) => EventSourceLike);
  const url = options.url ?? '/api/stream';
  const pollMs = options.pollMs ?? 5_000;
  let closed = false;
  let source: EventSourceLike | null = null;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function stopPoll() {
    if (pollTimer === undefined) return;
    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function startPoll() {
    if (pollTimer !== undefined) return;
    options.onPoll();
    pollTimer = setInterval(() => options.onPoll(), pollMs);
  }

  function connect() {
    if (closed) return;
    const next = new Source(url);
    source = next;
    next.onopen = () => {
      attempt = 0;
      stopPoll();
      options.onStatus('live');
    };
    next.onerror = () => {
      next.close();
      if (source === next) source = null;
      attempt += 1;
      options.onStatus(attempt >= 3 ? 'offline' : 'delayed');
      if (attempt >= 3) startPoll();
      const delay = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      reconnectTimer = setTimeout(connect, delay);
    };
    for (const type of EVENT_TYPES) {
      next.addEventListener(type, (message) => {
        let payload: unknown;
        try {
          payload = JSON.parse(message.data);
        } catch {
          return;
        }
        const parsed = appEventSchema.safeParse(payload);
        if (parsed.success) options.onEvent(parsed.data);
      });
    }
  }

  connect();
  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    stopPoll();
    source?.close();
  };
}
