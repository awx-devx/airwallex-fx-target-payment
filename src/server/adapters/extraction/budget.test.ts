import {
  ExtractionBudgetError,
  closeExtractionBudget,
  takeExtractionCall,
} from '@/server/adapters/extraction/budget';
import { afterAll, describe, expect, it } from 'vitest';

const redisUrl = process.env.REDIS_URL ?? '';
const windowSec = 3600;
const nowMs = Date.parse('2031-06-01T00:00:00.000Z');

describe('extraction budget', () => {
  afterAll(async () => {
    await closeExtractionBudget();
  });

  it('refuses the call past the cap and allows the next window', async () => {
    const input = { redisUrl, maxCalls: 2, windowSec, nowMs };
    await takeExtractionCall(input);
    await takeExtractionCall(input);
    await expect(takeExtractionCall(input)).rejects.toBeInstanceOf(ExtractionBudgetError);
    await takeExtractionCall({ ...input, nowMs: nowMs + windowSec * 1000 });
  });
});
