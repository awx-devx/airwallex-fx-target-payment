import { describe, expect, it } from 'vitest';
import { ENDPOINT_RPS } from '@/server/adapters/airwallex/limiter';
import {
  pollFitsBudget,
  pollRequestsPerSecond,
  TARGET_WATCHING_BILLS,
} from '@/server/domain/pollBudget';

describe('poll budget', () => {
  it('keeps the 10s poll under the endpoint bucket at the target bill count', () => {
    const perSecond = pollRequestsPerSecond(TARGET_WATCHING_BILLS, 10_000);
    expect(perSecond).toBe(5);
    expect(
      pollFitsBudget({
        bills: TARGET_WATCHING_BILLS,
        pollIntervalMs: 10_000,
        endpointRps: ENDPOINT_RPS,
      }),
    ).toBe(true);
    expect(
      pollFitsBudget({
        bills: 90,
        pollIntervalMs: 10_000,
        endpointRps: ENDPOINT_RPS,
      }),
    ).toBe(false);
  });
});
