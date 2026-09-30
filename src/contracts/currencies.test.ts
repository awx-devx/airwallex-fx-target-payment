import { describe, expect, it } from 'vitest';
import { CURRENCIES, getCurrency, pipSize, roundToPayout } from '@/contracts/currencies';

describe('currencies', () => {
  it('lists the payout table, with KES and SAR at 0 dp', () => {
    expect(CURRENCIES).toHaveLength(91);
    expect(getCurrency('KES')).toMatchObject({ payoutPrecision: 0, isoPrecision: 2 });
    expect(getCurrency('SAR')).toMatchObject({ payoutPrecision: 0, isoPrecision: 2 });
    expect(getCurrency('JPY')?.payoutPrecision).toBe(0);
    expect(getCurrency('BHD')?.payoutPrecision).toBe(3);
    expect(getCurrency('EUR')?.isoPrecision).toBe(2);
  });

  it('records conditional sell flags', () => {
    expect(getCurrency('INR')?.fx).toMatchObject({
      buy: true,
      sell: false,
      pureConversion: false,
      convertAndPayout: true,
    });
    expect(getCurrency('IDR')?.fx.note).toMatch(/CN and HK/);
    expect(getCurrency('IDR')?.fx.pureConversion).toBe(false);
    expect(getCurrency('MYR')?.fx.note).toMatch(/MY customers/);
    expect(getCurrency('AED')?.fx.note).toMatch(/UAE/);
    expect(getCurrency('BHD')?.fx.sell).toBe(false);
    expect(getCurrency('EUR')?.fx).toMatchObject({
      buy: true,
      sell: true,
      pureConversion: true,
      convertAndPayout: true,
    });
  });

  it('rounds payout amounts without binary floats', () => {
    expect(roundToPayout('JPY', '8500000.4')).toBe('8500000');
    expect(roundToPayout('KES', '10.5')).toBe('11');
    expect(roundToPayout('EUR', '250000.005')).toBe('250000.01');
    expect(roundToPayout('BHD', '1.2345')).toBe('1.235');
    expect(pipSize('JPY')).toBe('0.01');
    expect(pipSize('EUR')).toBe('0.0001');
  });
});
