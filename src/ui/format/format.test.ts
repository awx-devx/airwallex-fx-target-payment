import { describe, expect, it } from 'vitest';
import {
  favorable,
  formatCountdown,
  formatDelta,
  formatMoney,
  formatPair,
  formatPrice,
  priceFractionDigits,
  splitPips,
} from '@/ui/format/format';

const EUR_USD = { base: 'EUR', quote: 'USD' };
const JPY_USD = { base: 'JPY', quote: 'USD' };
const USD_JPY = { base: 'USD', quote: 'JPY' };

describe('formatPrice', () => {
  it('uses 5 decimals by default and 3 when the displayed quote is JPY', () => {
    expect(priceFractionDigits('USD')).toBe(5);
    expect(priceFractionDigits('JPY')).toBe(3);
    expect(formatPrice(EUR_USD, '1.084125')).toBe('1.08413');
    expect(formatPrice(USD_JPY, '149.2537')).toBe('149.254');
  });

  it('inverts the canonical price and the pair label', () => {
    expect(formatPair(EUR_USD)).toBe('EUR/USD');
    expect(formatPair(JPY_USD, { inverted: true })).toBe('USD/JPY');
    expect(formatPrice(JPY_USD, '0.0067')).toBe('0.00670');
    expect(formatPrice(JPY_USD, '0.0067', { inverted: true })).toBe('149.254');
  });

  it('refuses to invert zero', () => {
    expect(() => formatPrice(EUR_USD, '0', { inverted: true })).toThrow(
      /zero price/,
    );
  });

  it('keeps a negative price signed when inverted', () => {
    expect(formatPrice(EUR_USD, '-0.5', { inverted: true })).toBe('-2.00000');
  });
});

describe('formatMoney', () => {
  it('groups at payout precision and suffixes the code', () => {
    expect(formatMoney('EUR', '250000')).toBe('250,000.00 EUR');
    expect(formatMoney('EUR', '1234567.8')).toBe('1,234,567.80 EUR');
    expect(formatMoney('JPY', '1500')).toBe('1,500 JPY');
    expect(formatMoney('KES', '100.5')).toBe('101 KES');
    expect(formatMoney('BHD', '1.2345')).toBe('1.235 BHD');
  });

  it('signs positives only when asked, and always signs negatives', () => {
    expect(formatMoney('EUR', '12.5', { signed: true })).toBe('+12.50 EUR');
    expect(formatMoney('EUR', '0', { signed: true })).toBe('0.00 EUR');
    expect(formatMoney('EUR', '-1234.5')).toBe('−1,234.50 EUR');
    expect(formatMoney('EUR', '-1234.5', { signed: true })).toBe(
      '−1,234.50 EUR',
    );
  });

  it('rejects an unknown currency', () => {
    expect(() => formatMoney('XXX', '1')).toThrow(/Unknown currency/);
  });
});

describe('formatDelta', () => {
  it('formats a price change, a ratio, and basis points', () => {
    expect(formatDelta('-0.00412', { pair: EUR_USD })).toBe('−0.00412');
    expect(formatDelta('0.00588', { pair: EUR_USD })).toBe('+0.00588');
    expect(formatDelta('0', { pair: EUR_USD })).toBe('0.00000');
    expect(formatDelta('-0.2', { pair: USD_JPY })).toBe('−0.200');
    expect(formatDelta('-0.0041')).toBe('−0.0041');
    expect(formatDelta('0.0042', { mode: 'pct' })).toBe('+0.42%');
    expect(formatDelta('-0.0042', { mode: 'pct' })).toBe('−0.42%');
    expect(formatDelta('0', { mode: 'pct' })).toBe('0.00%');
    expect(formatDelta('12', { mode: 'bps' })).toBe('+12 bps');
    expect(formatDelta('-12', { mode: 'bps' })).toBe('−12 bps');
    expect(formatDelta('0', { mode: 'bps' })).toBe('0 bps');
    expect(formatDelta('12.5', { mode: 'bps' })).toBe('+12.5 bps');
    expect(formatDelta('12.125', { mode: 'bps' })).toBe('+12.13 bps');
  });
});

describe('formatCountdown', () => {
  it('pads a clock and clamps anything that is not a positive duration', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(59.9)).toBe('00:59');
    expect(formatCountdown(90)).toBe('01:30');
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(86400)).toBe('1d 00:00:00');
    expect(formatCountdown(90061)).toBe('1d 01:01:01');
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00');
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});

describe('favorable', () => {
  it('treats a canonical price decrease as favourable', () => {
    expect(favorable('-0.00412')).toBe('favorable');
    expect(favorable('0.00588')).toBe('adverse');
    expect(favorable('0')).toBe('neutral');
    expect(favorable('-0')).toBe('neutral');
  });
});

describe('splitPips', () => {
  it('keeps the last two digits for emphasis', () => {
    expect(splitPips('1.08412')).toEqual({ head: '1.084', pips: '12' });
    expect(splitPips('149.254')).toEqual({ head: '149.2', pips: '54' });
    expect(splitPips('−0.00412')).toEqual({ head: '−0.004', pips: '12' });
    expect(splitPips('12')).toEqual({ head: '', pips: '12' });
    expect(splitPips('1')).toEqual({ head: '1', pips: '' });
    expect(splitPips('')).toEqual({ head: '', pips: '' });
  });
});
