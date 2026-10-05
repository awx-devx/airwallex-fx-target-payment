import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/demo/clock/route';
import { demoRoutesEnabled } from '@/server/demo/gate';
import { parseEnv, resetEnvCache } from '@/server/env';
import { setDemoClock } from '@/server/services/demo';

describe('demo routes', () => {
  it('stays off unless DEMO_MODE is true', async () => {
    expect(demoRoutesEnabled({ DEMO_MODE: 'false' })).toBe(false);
    expect(demoRoutesEnabled({})).toBe(true);
    const env = { ...parseEnv(process.env), DEMO_MODE: false };
    await expect(
      setDemoClock({ env, readRealMs: () => 0, speed: 2 }),
    ).rejects.toMatchObject({
      status: 404,
    });
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'false';
    resetEnvCache();
    try {
      const response = await POST(
        new Request('http://localhost/api/demo/clock', {
          method: 'POST',
          body: JSON.stringify({ speed: 2 }),
        }),
      );
      expect(response.status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = previous;
      resetEnvCache();
    }
  });
});
