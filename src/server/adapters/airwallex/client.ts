import { SystemClock, type Clock } from '@/server/adapters/clock';
import {
  AirwallexAuth,
  type AirwallexToken,
} from '@/server/adapters/airwallex/auth';
import {
  AirwallexError,
  airwallexErrorFromBody,
  isRequestPending,
} from '@/server/adapters/airwallex/errors';
import {
  parseAirwallexJson,
  stringifyAirwallexJson,
} from '@/server/adapters/airwallex/json';
import {
  backoffMs,
  TokenBucketLimiter,
} from '@/server/adapters/airwallex/limiter';
import { parseAwxTimestamp } from '@/server/adapters/airwallex/time';
import { isRecord } from '@/server/adapters/airwallex/values';
import type { Env } from '@/server/env';
import {
  logAirwallexCall,
  type AppLogger,
  getLogger,
} from '@/server/logging/logger';

const MAX_ATTEMPTS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** AIRWALLEX: the trace header name is confirmed by the B2 smoke recording. */
const TRACE_HEADERS = ['x-airwallex-trace-id', 'x-trace-id'];

export const ENDPOINT_GROUPS = [
  'authentication',
  'fx',
  'transfers',
  'beneficiaries',
  'balances',
  'reference',
  'files',
  'spend',
  'simulation',
] as const;
export type EndpointGroup = (typeof ENDPOINT_GROUPS)[number];

export function endpointGroup(path: string): EndpointGroup {
  if (path.startsWith('/authentication')) return 'authentication';
  if (path.startsWith('/fx/')) return 'fx';
  if (path.startsWith('/transfers')) return 'transfers';
  if (path.startsWith('/beneficiar')) return 'beneficiaries';
  if (path.startsWith('/balances')) return 'balances';
  if (path.startsWith('/reference')) return 'reference';
  if (path.startsWith('/files')) return 'files';
  if (path.startsWith('/spend') || path.startsWith('/account')) return 'spend';
  if (path.startsWith('/simulation')) return 'simulation';
  throw new Error(`No Airwallex endpoint group for ${path}`);
}

export function endpointKey(method: string, path: string): string {
  const parts = path
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => (UUID.test(part) ? '{id}' : part));
  return `${method} /${parts.join('/')}`;
}

export function airwallexUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  const root = trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
  const url = new URL(`${root}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export interface AirwallexRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  host?: 'api' | 'files';
  /** Login is the only call that skips the bearer token. */
  auth?: boolean;
}

export interface AirwallexClientOptions {
  baseUrl: string;
  filesBaseUrl: string;
  apiVersion: string;
  versionOverrides?: Partial<Record<EndpointGroup, string>>;
  clientId?: string;
  apiKey?: string;
  loginAs?: string;
  envName: 'sandbox' | 'production';
  flags: { spend: boolean; files: boolean };
  clock: Clock;
  limiter?: TokenBucketLimiter;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: AppLogger;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AirwallexClient {
  readonly envName: 'sandbox' | 'production';
  readonly flags: { spend: boolean; files: boolean };
  readonly clock: Clock;
  private readonly auth: AirwallexAuth;
  private readonly limiter: TokenBucketLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly logger: AppLogger;

  constructor(private readonly options: AirwallexClientOptions) {
    this.envName = options.envName;
    this.flags = options.flags;
    this.clock = options.clock;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.logger = options.logger ?? getLogger();
    this.limiter =
      options.limiter ??
      new TokenBucketLimiter({
        now: () => options.clock.now().getTime(),
        sleep: this.sleep,
      });
    this.auth = new AirwallexAuth({
      clock: options.clock,
      login: () => this.login(),
    });
  }

  /** Confirms the process can obtain an access token. Health uses this and nothing else. */
  async confirmToken(): Promise<void> {
    await this.auth.getToken();
  }

  async request(input: AirwallexRequest): Promise<unknown> {
    const retryable = canRetry(input);
    let authRetried = false;
    let attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      const started = this.clock.now().getTime();
      let response: Response;
      try {
        await this.limiter.take(endpointKey(input.method, input.path));
        response = await this.dispatch(input);
      } catch (error) {
        if (error instanceof AirwallexError) throw error;
        logAirwallexCall(this.logger, {
          method: input.method,
          path: input.path,
          latencyMs: this.clock.now().getTime() - started,
          requestId: requestIdOf(input.body),
        });
        if (!retryable || attempt >= MAX_ATTEMPTS) {
          throw new AirwallexError({
            status: 0,
            code: 'network_error',
            message:
              error instanceof Error
                ? error.message
                : 'Airwallex network error',
          });
        }
        await this.sleep(backoffMs(attempt, this.random));
        continue;
      }

      const text = await response.text();
      const traceId = traceIdOf(response);
      logAirwallexCall(this.logger, {
        method: input.method,
        path: input.path,
        status: response.status,
        traceId,
        latencyMs: this.clock.now().getTime() - started,
        requestId: requestIdOf(input.body),
      });

      if (response.status === 401 && input.auth !== false) {
        if (authRetried) {
          throw airwallexErrorFromBody(
            response.status,
            parseBody(text),
            traceId,
          );
        }
        authRetried = true;
        this.auth.invalidate();
        attempt -= 1;
        continue;
      }

      if (response.ok) {
        if (text.length === 0) return undefined;
        try {
          return parseAirwallexJson(text);
        } catch {
          throw new AirwallexError({
            status: response.status,
            code: 'invalid_response',
            message: 'Airwallex response was not JSON',
            traceId,
          });
        }
      }

      const error = airwallexErrorFromBody(
        response.status,
        parseBody(text),
        traceId,
      );
      const retryStatus = response.status === 429 || response.status >= 500;
      const pending = isRequestPending(error);
      if ((retryStatus || pending) && retryable && attempt < MAX_ATTEMPTS) {
        await this.sleep(backoffMs(attempt, this.random));
        continue;
      }
      throw error;
    }
    throw new AirwallexError({
      status: 0,
      code: 'network_error',
      message: 'Airwallex retries exhausted',
    });
  }

  assertSpendEnabled(): void {
    if (!this.flags.spend) {
      throw new AirwallexError({
        status: 403,
        code: 'feature_disabled',
        message: 'SPEND_SYNC is off',
      });
    }
  }

  assertFilesEnabled(): void {
    if (!this.flags.files) {
      throw new AirwallexError({
        status: 403,
        code: 'feature_disabled',
        message: 'FILES_UPLOAD is off',
      });
    }
  }

  assertSandbox(): void {
    if (this.envName !== 'sandbox') {
      throw new AirwallexError({
        status: 403,
        code: 'simulation_unavailable',
        message: 'Simulation endpoints exist only in the sandbox',
      });
    }
  }

  private async login(): Promise<AirwallexToken> {
    if (!this.options.clientId || !this.options.apiKey) {
      throw new AirwallexError({
        status: 0,
        code: 'credentials_missing',
        message: 'AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY are required',
      });
    }
    const body = await this.request({
      method: 'POST',
      path: '/authentication/login',
      auth: false,
    });
    if (
      !isRecord(body) ||
      typeof body.token !== 'string' ||
      typeof body.expires_at !== 'string'
    ) {
      throw new AirwallexError({
        status: 200,
        code: 'credentials_invalid',
        message: 'Login response did not include a token',
      });
    }
    return { token: body.token, expiresAt: parseAwxTimestamp(body.expires_at) };
  }

  private async dispatch(input: AirwallexRequest): Promise<Response> {
    const group = endpointGroup(input.path);
    const headers = new Headers();
    const form = input.body instanceof FormData ? input.body : undefined;
    if (!form && input.body !== undefined)
      headers.set('content-type', 'application/json');
    if (input.auth === false) {
      headers.set('x-client-id', this.options.clientId ?? '');
      headers.set('x-api-key', this.options.apiKey ?? '');
      if (this.options.loginAs) headers.set('x-login-as', this.options.loginAs);
    } else {
      headers.set('authorization', `Bearer ${await this.auth.getToken()}`);
      headers.set('x-api-version', this.versionFor(group));
    }
    const base =
      input.host === 'files' ? this.options.filesBaseUrl : this.options.baseUrl;
    return this.fetchImpl(airwallexUrl(base, input.path, input.query), {
      method: input.method,
      headers,
      body:
        form ??
        (input.body === undefined
          ? undefined
          : stringifyAirwallexJson(input.body)),
    });
  }

  private versionFor(group: EndpointGroup): string {
    return this.options.versionOverrides?.[group] ?? this.options.apiVersion;
  }
}

export function createAirwallexClient(
  env: Env,
  options?: Partial<
    Omit<
      AirwallexClientOptions,
      'flags' | 'envName' | 'baseUrl' | 'filesBaseUrl'
    >
  > & { flags?: Partial<AirwallexClientOptions['flags']> },
): AirwallexClient {
  return new AirwallexClient({
    baseUrl: env.AIRWALLEX_BASE_URL,
    filesBaseUrl: env.AIRWALLEX_FILES_BASE_URL,
    apiVersion: options?.apiVersion ?? env.AIRWALLEX_API_VERSION,
    versionOverrides: options?.versionOverrides,
    clientId: options?.clientId ?? env.AIRWALLEX_CLIENT_ID,
    apiKey: options?.apiKey ?? env.AIRWALLEX_API_KEY,
    loginAs: options?.loginAs ?? env.AIRWALLEX_LOGIN_AS,
    envName: env.AIRWALLEX_ENV,
    flags: {
      spend: options?.flags?.spend ?? env.SPEND_SYNC,
      files: options?.flags?.files ?? env.FILES_UPLOAD,
    },
    clock: options?.clock ?? new SystemClock(),
    limiter: options?.limiter,
    fetch: options?.fetch,
    sleep: options?.sleep,
    random: options?.random,
    logger: options?.logger,
  });
}

const sharedClients = new Map<string, AirwallexClient>();

/**
 * One client per process for a given account. Token expiry and the limiter
 * use the wall clock: the warp clock must not stretch a 30-minute token or
 * the sandbox rate limit.
 */
export function getAirwallexClient(env: Env): AirwallexClient {
  const key = sharedClientKey(env);
  const existing = sharedClients.get(key);
  if (existing) return existing;
  const client = createAirwallexClient(env, { clock: new SystemClock() });
  sharedClients.set(key, client);
  return client;
}

/** Tests drop the memoised client so a later call can log in again. */
export function resetSharedAirwallexClients(): void {
  sharedClients.clear();
}

function sharedClientKey(env: Env): string {
  return [
    env.AIRWALLEX_ENV,
    env.AIRWALLEX_BASE_URL,
    env.AIRWALLEX_FILES_BASE_URL,
    env.AIRWALLEX_API_VERSION,
    env.AIRWALLEX_CLIENT_ID ?? '',
    env.AIRWALLEX_API_KEY ?? '',
    env.AIRWALLEX_LOGIN_AS ?? '',
    env.SPEND_SYNC ? '1' : '0',
    env.FILES_UPLOAD ? '1' : '0',
  ].join('\0');
}

function canRetry(input: AirwallexRequest): boolean {
  if (input.method !== 'POST' || !input.path.endsWith('/create')) return true;
  return (
    isRecord(input.body) &&
    typeof input.body.request_id === 'string' &&
    input.body.request_id.length > 0
  );
}

function requestIdOf(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  return typeof body.request_id === 'string' ? body.request_id : undefined;
}

function traceIdOf(response: Response): string | undefined {
  for (const name of TRACE_HEADERS) {
    const value = response.headers.get(name);
    if (value) return value;
  }
  return undefined;
}

function parseBody(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return parseAirwallexJson(text);
  } catch {
    return undefined;
  }
}
