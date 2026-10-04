import type { Redis } from 'ioredis';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export const LEADER_KEY = 'worker:leader';
export const HEARTBEAT_KEY = 'worker:heartbeat';
export const LEADER_TTL_MS = 15_000;
export const LEADER_RENEW_MS = 5_000;
export const HEARTBEAT_MS = 10_000;
export const HEARTBEAT_TTL_MS = 30_000;

export class LeaderLock {
  constructor(
    private readonly redis: Redis,
    private readonly id: string,
    private readonly key = LEADER_KEY,
    private readonly ttlMs = LEADER_TTL_MS,
  ) {}

  async tryAcquire(): Promise<boolean> {
    const result = await this.redis.set(
      this.key,
      this.id,
      'PX',
      this.ttlMs,
      'NX',
    );
    return result === 'OK';
  }

  async renew(): Promise<boolean> {
    const result = await this.redis.eval(
      RENEW_SCRIPT,
      1,
      this.key,
      this.id,
      String(this.ttlMs),
    );
    return result === 1;
  }

  async release(): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.key, this.id);
  }
}

export function startLeaderLoop(options: {
  lock: LeaderLock;
  renewMs: number;
  onAcquired: () => void;
  onLost: () => void;
}): { stop: () => Promise<void> } {
  let held = false;
  let stopped = false;
  let ticking = false;

  const lose = () => {
    if (!held) return;
    held = false;
    options.onLost();
  };

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      if (!held) {
        held = await options.lock.tryAcquire();
        if (held) options.onAcquired();
        return;
      }
      const renewed = await options.lock.renew();
      if (!renewed) lose();
    } finally {
      ticking = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, options.renewMs);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      lose();
      await options.lock.release();
    },
  };
}
