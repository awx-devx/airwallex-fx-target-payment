import { z } from 'zod';
import { quoteValiditySchema } from '@/contracts/airwallex';
import { isCurrencyCode } from '@/contracts/currencies';

/**
 * Reads the object it is given. It does not open a `.env` file.
 * The worker and `pnpm db:indexes` pass `process.env` after Node's `--env-file`.
 * Tests pass the memory-server URIs and never the user's file.
 */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

function requiredText(label: string) {
  return z.preprocess(
    blankToUndefined,
    z.string().min(1, `${label} is required`),
  );
}

function text(defaultValue: string) {
  return z.preprocess(
    blankToUndefined,
    z.string().min(1).default(defaultValue),
  );
}

function optionalText() {
  return z.preprocess(blankToUndefined, z.string().min(1).optional());
}

function intWithDefault(defaultValue: number, min: number) {
  return z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(min).default(defaultValue),
  );
}

function isIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const envSchema = z.object({
  AIRWALLEX_ENV: z.preprocess(
    blankToUndefined,
    z.enum(['sandbox', 'production']).default('sandbox'),
  ),
  AIRWALLEX_BASE_URL: text('https://api.sandbox.airwallex.com'),
  AIRWALLEX_FILES_BASE_URL: text('https://files.sandbox.airwallex.com'),
  AIRWALLEX_CLIENT_ID: optionalText(),
  AIRWALLEX_API_KEY: optionalText(),
  AIRWALLEX_LOGIN_AS: optionalText(),
  AIRWALLEX_API_VERSION: text('2026-08-21'),
  AIRWALLEX_WEBHOOK_SECRET: optionalText(),
  AIRWALLEX_ACCOUNT_TZ: z.preprocess(
    blankToUndefined,
    z
      .string()
      .min(1)
      .refine(isIanaTimeZone, 'Expected an IANA time zone')
      .default('America/Los_Angeles'),
  ),
  AIRWALLEX_GLOBAL_ACCOUNT_ID: optionalText(),
  SPEND_SYNC: z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  ),
  FILES_UPLOAD: z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  ),

  MONGODB_URI: requiredText('MONGODB_URI'),
  REDIS_URL: requiredText('REDIS_URL'),
  HOME_CURRENCY: z.preprocess(
    blankToUndefined,
    z.string().refine(isCurrencyCode, 'Unknown currency').default('USD'),
  ),
  DEMO_MODE: z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  ),
  NEXT_PUBLIC_DATA_SOURCE: z.preprocess(
    blankToUndefined,
    z.enum(['mock', 'api']).default('mock'),
  ),
  RATE_SOURCE: z.preprocess(
    blankToUndefined,
    z.enum(['airwallex', 'simulated']).default('simulated'),
  ),
  PAYMENTS_GATEWAY: z.preprocess(
    blankToUndefined,
    z.enum(['airwallex', 'mock']).default('airwallex'),
  ),
  HISTORY_SOURCE: z.preprocess(
    blankToUndefined,
    z.enum(['frankfurter', 'none', 'simulated']).default('frankfurter'),
  ),
  BILL_EXTRACTOR: z.preprocess(
    blankToUndefined,
    z.enum(['anthropic', 'ollama', 'mock']).default('anthropic'),
  ),
  CLOCK: z.preprocess(
    blankToUndefined,
    z.enum(['system', 'warp']).default('system'),
  ),
  DEADLINE_SAFETY_NET: z.preprocess(
    blankToUndefined,
    z.enum(['none', 'airwallex']).default('none'),
  ),

  POLL_INTERVAL_MS: intWithDefault(10_000, 1),
  TRIGGER_CONFIRM_TICKS: intWithDefault(2, 1),
  TRIGGER_BUFFER_BPS: intWithDefault(0, 0),
  QUOTE_VALIDITY_TARGET: z.preprocess(
    blankToUndefined,
    quoteValiditySchema.default('MIN_1'),
  ),
  QUOTE_VALIDITY_DEADLINE: z.preprocess(
    blankToUndefined,
    quoteValiditySchema.default('MIN_1'),
  ),
  DEADLINE_AUTOSETTLE_CUTOFF: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm')
      .default('14:00'),
  ),
  RATE_TICKS_TTL_DAYS: intWithDefault(30, 1),

  ANTHROPIC_API_KEY: optionalText(),
  EXTRACTION_MODEL: text('claude-haiku-4-5'),
  EXTRACTION_MODEL_STRONG: text('claude-sonnet-5'),
  EXTRACTION_MAX_PAGES: intWithDefault(3, 1),
  EXTRACTION_MAX_CALLS: intWithDefault(20, 0),
  EXTRACTION_WINDOW_SEC: intWithDefault(3600, 1),
  EXTRACTION_ESCALATE: z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  ),
  OLLAMA_URL: optionalText(),
  OLLAMA_MODEL: optionalText(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  readonly issues: { path: string; message: string }[];

  constructor(issues: { path: string; message: string }[]) {
    super(
      `Invalid environment: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
    this.name = 'EnvError';
    this.issues = issues;
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

let cached: Env | undefined;

/** Parsed process environment. Throws on the first call when a required value is missing. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
