import type { Clock } from '@/server/adapters/clock';

const REFRESH_SKEW_MS = 60_000;

export interface AirwallexToken {
  token: string;
  expiresAt: Date;
}

/**
 * In-memory token per process. Concurrent callers share one login.
 * Refresh when `now > expires_at − 60s`.
 */
export class AirwallexAuth {
  private token: AirwallexToken | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly options: {
      clock: Clock;
      login: () => Promise<AirwallexToken>;
      refreshSkewMs?: number;
    },
  ) {}

  async getToken(): Promise<string> {
    const skew = this.options.refreshSkewMs ?? REFRESH_SKEW_MS;
    const now = this.options.clock.now().getTime();
    if (this.token && now < this.token.expiresAt.getTime() - skew) {
      return this.token.token;
    }
    if (!this.inflight) {
      this.inflight = this.options
        .login()
        .then((result) => {
          this.token = result;
          return result.token;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  invalidate(): void {
    this.token = null;
  }
}
