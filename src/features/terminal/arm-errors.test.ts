import { methodUnavailable, splitArmErrors } from '@/features/terminal/arm-errors';
import { describe, expect, it } from 'vitest';

describe('splitArmErrors', () => {
  it('keeps a method failure and drops the routing fields that came with it', () => {
    const split = splitArmErrors([
      {
        path: 'create_transfer_request',
        code: '031',
        message: "This bank can't receive this currency via this method",
      },
      {
        path: 'beneficiary.bank_details.account_routing_type1',
        code: '001',
        message: 'Required',
      },
      {
        path: 'beneficiary.bank_details.bank_account_category',
        code: '001',
        message: 'Required',
      },
    ]);
    expect(split.method).toBe("This bank can't receive this currency via this method");
    expect(split.fields).toEqual([]);
  });

  it('returns friendly field messages without paths', () => {
    const split = splitArmErrors([
      {
        path: 'beneficiary.bank_details.account_routing_type1',
        code: '001',
        message: 'Required',
      },
      {
        path: 'beneficiary.bank_details.account_routing_value1',
        code: '001',
        message: 'Required',
      },
    ]);
    expect(split.method).toBeUndefined();
    expect(split.fields).toEqual(['Required']);
  });
});

describe('methodUnavailable', () => {
  it('disables a method the beneficiary does not accept', () => {
    expect(methodUnavailable('SWIFT', 'JPY', ['LOCAL'])).toBe(
      "This bank can't receive JPY via SWIFT.",
    );
    expect(methodUnavailable('LOCAL', 'JPY', ['LOCAL'])).toBeUndefined();
  });

  it('keeps a method disabled after validate rejects it', () => {
    expect(
      methodUnavailable('SWIFT', 'JPY', ['LOCAL', 'SWIFT'], {
        method: 'SWIFT',
        message: "This bank can't receive this currency via this method",
      }),
    ).toBe("This bank can't receive this currency via this method");
  });
});
