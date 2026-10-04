import { describe, expect, it } from 'vitest';
import { AirwallexAuth } from '@/server/adapters/airwallex/auth';

const now = new Date('2026-01-01T00:00:00.000Z');

describe('AirwallexAuth', () => {
  it('reuses a token until 60 seconds before expiry', async () => {
    let logins = 0;
    const auth = new AirwallexAuth({
      clock: { now: () => now },
      login: async () => {
        logins += 1;
        return {
          token: `tok-${logins}`,
          expiresAt: new Date(now.getTime() + 120_000),
        };
      },
    });
    await expect(auth.getToken()).resolves.toBe('tok-1');
    await expect(auth.getToken()).resolves.toBe('tok-1');
    expect(logins).toBe(1);
  });

  it('logs in again inside the 60 second window', async () => {
    let logins = 0;
    const auth = new AirwallexAuth({
      clock: { now: () => now },
      login: async () => {
        logins += 1;
        return {
          token: `tok-${logins}`,
          expiresAt: new Date(now.getTime() + 30_000),
        };
      },
    });
    await auth.getToken();
    await expect(auth.getToken()).resolves.toBe('tok-2');
    expect(logins).toBe(2);
  });

  it('shares one login across concurrent callers', async () => {
    let logins = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const auth = new AirwallexAuth({
      clock: { now: () => now },
      login: async () => {
        logins += 1;
        await gate;
        return {
          token: 'shared',
          expiresAt: new Date(now.getTime() + 120_000),
        };
      },
    });
    const pending = Promise.all([auth.getToken(), auth.getToken()]);
    expect(logins).toBe(1);
    release();
    await expect(pending).resolves.toEqual(['shared', 'shared']);
    expect(logins).toBe(1);
  });
});
