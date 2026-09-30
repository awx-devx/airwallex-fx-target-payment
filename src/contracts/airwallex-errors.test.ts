import { describe, expect, it } from 'vitest';
import { FAILURE_CATEGORIES } from '@/contracts/airwallex';
import {
  FAILURE_NEXT_STEP,
  failureCategory,
  fieldErrorMessage,
  isInternalFieldError,
} from '@/contracts/airwallex-errors';

const GROUPS: Array<{ name: string; codes: string[]; sample: string }> = [
  { name: 'required', codes: ['001'], sample: 'Required' },
  {
    name: 'character set',
    codes: ['002', '003', '004', '005', '006', '007', '012', '013', '014', '090'],
    sample: 'Only letters, numbers and basic punctuation',
  },
  {
    name: 'numeric',
    codes: ['008', '009', '015', '042', '101'],
    sample: 'Numbers only',
  },
  {
    name: 'enum',
    codes: ['010', '011', '016', '017'],
    sample: 'Invalid value',
  },
  {
    name: 'length',
    codes: ['018', '019', '020', '021', '022'],
    sample: '5–200 characters',
  },
  { name: 'metadata', codes: ['023'], sample: 'Too many metadata keys' },
  {
    name: 'date',
    codes: ['025', '026', '027'],
    sample: 'Use an ISO date and time',
  },
  {
    name: 'contact',
    codes: ['028', '029', '030', '092', '099', '100'],
    sample: 'PO boxes',
  },
  {
    name: 'method',
    codes: ['024', '031', '040', '043'],
    sample: 'SWIFT',
  },
  {
    name: 'swift',
    codes: ['032', '033'],
    sample: 'SWIFT',
  },
  {
    name: 'bank code',
    codes: ['035', '082', '086', '087', '088'],
    sample: 'Bank or branch code not recognised',
  },
  {
    name: 'iban',
    codes: ['036', '091'],
    sample: 'IBAN',
  },
  {
    name: 'amount',
    codes: ['037', '038'],
    sample: '1000',
  },
  {
    name: 'account',
    codes: ['039', '085'],
    sample: 'Account number not valid for this bank',
  },
  {
    name: 'internal',
    codes: ['044', '045', '046', '047', '048', '050'],
    sample: 'could not be validated',
  },
];

describe('fieldErrorMessage', () => {
  for (const group of GROUPS) {
    it(`covers ${group.name}`, () => {
      for (const code of group.codes) {
        const message = fieldErrorMessage(code, {
          length_min: 5,
          length_max: 200,
          length: 8,
          length_options: '8,11',
          value_options: 'LOCAL, SWIFT',
          value: 'LOCAL',
          amount_max: 1000,
          amount_max_currency: 'EUR',
          amount_min: 1,
          amount_min_currency: 'EUR',
          decimal_max: 2,
          min: 1,
          max: 5,
          country_code: '49',
        });
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toBe('AWX_FALLBACK');
        if (code === group.codes[0]) expect(message).toContain(group.sample);
      }
    });
  }

  it('interpolates length, decimals and allowed values', () => {
    expect(fieldErrorMessage('018', { length_min: 5, length_max: 200 })).toBe(
      '5–200 characters',
    );
    expect(fieldErrorMessage('042', { decimal_max: 0 })).toBe('Max 0 decimals');
    expect(fieldErrorMessage('042', { decimals: 2 })).toBe('Max 2 decimals');
    expect(fieldErrorMessage('016', { values: 'LOCAL, SWIFT' })).toBe(
      'Must be one of LOCAL, SWIFT',
    );
    expect(fieldErrorMessage('037', { amount_max: '1000', amount_max_currency: 'EUR' })).toBe(
      'Max 1000 EUR',
    );
    expect(fieldErrorMessage('101', { min: 1, max: 9 })).toBe('Between 1 and 9');
  });

  it('falls back to the Airwallex message for unknown codes', () => {
    expect(fieldErrorMessage('051', undefined, 'The BPAY biller code is invalid')).toBe(
      'The BPAY biller code is invalid',
    );
    expect(fieldErrorMessage('102', undefined, 'This proxy ID is invalid')).toBe(
      'This proxy ID is invalid',
    );
    expect(fieldErrorMessage('999', undefined, 'Raw Airwallex text')).toBe('Raw Airwallex text');
    expect(fieldErrorMessage('034')).toBe('Validation error 034');
  });

  it('marks internal codes', () => {
    expect(isInternalFieldError('023')).toBe(true);
    expect(isInternalFieldError('050')).toBe(true);
    expect(isInternalFieldError('001')).toBe(false);
  });
});

describe('failureCategory', () => {
  const samples: Record<(typeof FAILURE_CATEGORIES)[number], string> = {
    BENEFICIARY_DETAILS: 'INVALID_ACCOUNT_NAME_OR_NUMBER',
    ACCOUNT: 'ACCOUNT_CLOSED',
    RETURNED: 'BENEFICIARY_BANK_RETURNED',
    FUNDS_OR_LIMITS: 'INSUFFICIENT_FUNDS',
    COMPLIANCE: 'TM_SUSPENDED',
    CLIENT: 'CLIENT_REQUESTED',
    SYSTEM: 'SYSTEM_ERROR',
  };

  for (const category of FAILURE_CATEGORIES) {
    it(`classifies ${category}`, () => {
      expect(failureCategory(samples[category])).toBe(category);
      expect(FAILURE_NEXT_STEP[category].length).toBeGreaterThan(0);
    });
  }

  it('prefers details.type, then reason codes, then code', () => {
    expect(
      failureCategory({
        type: 'ACCOUNT_CLOSED',
        reasonCodes: ['SYSTEM_ERROR'],
        code: '90502',
      }),
    ).toBe('ACCOUNT');
    expect(failureCategory({ reasonCodes: ['CLIENT_REQUESTED'], code: 'OTHER' })).toBe('CLIENT');
    expect(failureCategory({ code: 'INVALID_SWIFT_BIC_CODE' })).toBe('BENEFICIARY_DETAILS');
    expect(failureCategory({ type: 'TM_SUSPEND' })).toBe('COMPLIANCE');
  });

  it('falls back to SYSTEM', () => {
    expect(failureCategory('NOT_A_REAL_TYPE')).toBe('SYSTEM');
    expect(failureCategory({ code: '90502' })).toBe('SYSTEM');
    expect(failureCategory('INBOUND_PAYMENT_REJECTED')).toBe('SYSTEM');
  });
});
