import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from '@/server/adapters/airwallex/limiter';

describe('TokenBucketLimiter', () => {
  it('waits when the endpoint bucket is empty', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new TokenBucketLimiter({
      globalRps: 10,
      endpointRps: 1,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await limiter.take('GET /fx/rates/current');
    await limiter.take('GET /fx/rates/current');
    expect(waits.length).toBeGreaterThan(0);
    expect(now).toBeGreaterThanOrEqual(1000);
  });
});
