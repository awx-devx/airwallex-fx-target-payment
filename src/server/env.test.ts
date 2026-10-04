import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@/server/env';

const required = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/fxtarget',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('parseEnv', () => {
  it('fails when a required variable is missing', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({ REDIS_URL: required.REDIS_URL })).toThrow(
      /MONGODB_URI/,
    );
    expect(() => parseEnv({ MONGODB_URI: required.MONGODB_URI })).toThrow(
      /REDIS_URL/,
    );
  });

  it('rejects an unknown clock and an empty required value', () => {
    expect(() => parseEnv({ ...required, CLOCK: 'local' })).toThrow(/CLOCK/);
    expect(() => parseEnv({ ...required, MONGODB_URI: '   ' })).toThrow(
      /MONGODB_URI/,
    );
  });

  it('applies documented defaults and does not read a file', () => {
    const env = parseEnv(required);
    expect(env.HOME_CURRENCY).toBe('USD');
    expect(env.CLOCK).toBe('system');
    expect(env.PAYMENTS_GATEWAY).toBe('airwallex');
    expect(env.QUOTE_VALIDITY_TARGET).toBe('MIN_1');
    expect(env.DEMO_MODE).toBe(true);
    expect(env.AIRWALLEX_CLIENT_ID).toBeUndefined();
    expect(env.SPEND_SYNC).toBe(false);
    expect(env.FILES_UPLOAD).toBe(false);
    expect(env.EXTRACTION_MAX_CALLS).toBe(20);
    expect(env.EXTRACTION_WINDOW_SEC).toBe(3600);
    expect(env.MONGODB_URI).toBe(required.MONGODB_URI);
  });
});
