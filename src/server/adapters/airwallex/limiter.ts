/** Sandbox-safe defaults from docs/04 §1. */
export const GLOBAL_RPS = 15;
export const ENDPOINT_RPS = 8;

interface Bucket {
  rps: number;
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory token bucket. The demo runs one worker process, so the limit
 * does not need to be shared. `now` and `sleep` are injected so tests can
 * advance time without waiting.
 */
export class TokenBucketLimiter {
  private readonly global: Bucket;
  private readonly endpoints = new Map<string, Bucket>();
  private readonly endpointRps: number;

  constructor(
    private readonly options: {
      globalRps?: number;
      endpointRps?: number;
      now: () => number;
      sleep: (ms: number) => Promise<void>;
    },
  ) {
    const globalRps = options.globalRps ?? GLOBAL_RPS;
    const endpointRps = options.endpointRps ?? ENDPOINT_RPS;
    if (globalRps < 1 || endpointRps < 1) {
      throw new Error('Rate limits must be at least 1 request per second');
    }
    const now = options.now();
    this.global = { rps: globalRps, tokens: globalRps, updatedAt: now };
    this.endpointRps = endpointRps;
  }

  async take(endpoint: string): Promise<void> {
    const bucket = this.bucket(endpoint);
    for (;;) {
      const now = this.options.now();
      const wait = Math.max(
        this.delay(this.global, now),
        this.delay(bucket, now),
      );
      if (wait === 0) {
        this.commit(this.global, now);
        this.commit(bucket, now);
        return;
      }
      await this.options.sleep(wait);
    }
  }

  private bucket(endpoint: string): Bucket {
    const existing = this.endpoints.get(endpoint);
    if (existing) return existing;
    const created: Bucket = {
      rps: this.endpointRps,
      tokens: this.endpointRps,
      updatedAt: this.options.now(),
    };
    this.endpoints.set(endpoint, created);
    return created;
  }

  private delay(bucket: Bucket, now: number): number {
    const tokens = this.refilled(bucket, now);
    if (tokens >= 1) return 0;
    return Math.ceil(((1 - tokens) / bucket.rps) * 1000);
  }

  private commit(bucket: Bucket, now: number): void {
    bucket.tokens = this.refilled(bucket, now) - 1;
    bucket.updatedAt = now;
  }

  private refilled(bucket: Bucket, now: number): number {
    const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
    return Math.min(bucket.rps, bucket.tokens + elapsed * bucket.rps);
  }
}

/** 1s, 2s, 4s, 8s, capped at 16s, with jitter in [0.5, 1]. */
export function backoffMs(failedAttempt: number, random: () => number): number {
  const base = Math.min(1000 * 2 ** (failedAttempt - 1), 16_000);
  const unit = Math.min(1, Math.max(0, random()));
  return Math.round(base * (0.5 + unit * 0.5));
}
