import { Writable } from 'node:stream';
import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'authorization',
  '*.authorization',
  'headers.authorization',
  '*.headers.authorization',
  'req.headers.authorization',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
  'x-api-key',
  '*.x-api-key',
  'AIRWALLEX_API_KEY',
  '*.AIRWALLEX_API_KEY',
  'AIRWALLEX_CLIENT_ID',
  '*.AIRWALLEX_CLIENT_ID',
  'AIRWALLEX_WEBHOOK_SECRET',
  '*.AIRWALLEX_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  '*.ANTHROPIC_API_KEY',
  'iban',
  '*.iban',
  'account_number',
  '*.account_number',
  'accountNumber',
  '*.accountNumber',
];

export type AppLogger = Logger;

export function createLogger(options?: {
  level?: string;
  stream?: NodeJS.WritableStream;
  bindings?: Record<string, string>;
}): AppLogger {
  const pinoOptions: LoggerOptions = {
    level: options?.level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: options?.bindings,
  };
  const logger = options?.stream
    ? pino(pinoOptions, options.stream as pino.DestinationStream)
    : pino(pinoOptions);
  return logger;
}

let root: AppLogger | undefined;

export function getLogger(): AppLogger {
  root ??= createLogger();
  return root;
}

/** One JSON line per Airwallex call, including the provider `trace_id`. */
export function logAirwallexCall(
  logger: AppLogger,
  call: {
    method: string;
    path: string;
    status?: number;
    traceId?: string;
    latencyMs: number;
    requestId?: string;
  },
): void {
  logger.info(
    {
      trace_id: call.traceId,
      request_id: call.requestId,
      method: call.method,
      path: call.path,
      status: call.status,
      latency_ms: call.latencyMs,
    },
    'airwallex',
  );
}

export function captureLogs(level = 'info'): {
  logger: AppLogger;
  lines: () => Record<string, unknown>[];
} {
  const rows: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim();
        if (trimmed) rows.push(JSON.parse(trimmed) as Record<string, unknown>);
      }
      callback();
    },
  });
  return { logger: createLogger({ level, stream }), lines: () => rows };
}
