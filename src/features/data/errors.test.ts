import { API_ERROR_CODES } from '@/contracts/airwallex';
import { presentApiError } from '@/features/data/errors';
import { describe, expect, it } from 'vitest';

describe('presentApiError', () => {
  it('covers every API error code', () => {
    for (const code of API_ERROR_CODES) {
      const presented = presentApiError({ code, message: 'from the server' });
      expect(presented.title.length).toBeGreaterThan(0);
      expect(presented.surface).toMatch(/toast|banner|stale/);
    }
  });

  it('puts field errors on the banner', () => {
    const presented = presentApiError({
      code: 'VALIDATION_FAILED',
      message: 'Check the form',
      fieldErrors: [{ path: 'amount', code: '008', message: 'Too many decimals' }],
    });
    expect(presented.surface).toBe('banner');
    expect(presented.fieldErrors?.[0]?.path).toBe('amount');
    expect(presented.body).toContain('amount: Too many decimals');
  });

  it('does not blame Airwallex for a server failure with no Airwallex payload', () => {
    const presented = presentApiError({
      code: 'AIRWALLEX_UNAVAILABLE',
      message: 'The database is unavailable',
    });
    expect(presented.title).toBe("The server didn't respond");
    expect(presented.body).toBe('The database is unavailable');
    expect(presented.surface).toBe('toast');
  });

  it('uses the quote-expired toast', () => {
    expect(presentApiError({ code: 'QUOTE_EXPIRED', message: 'expired' }).title).toBe(
      'Quote expired · still watching',
    );
    expect(presentApiError({ code: 'QUOTE_INVALID', message: 'invalid' }).body).toBe('Re-quoted');
  });
});
