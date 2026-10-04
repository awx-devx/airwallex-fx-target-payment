import { describe, expect, it } from 'vitest';
import {
  buildBeneficiaryBody,
  readApiSchema,
  type BeneficiaryDraft,
} from '@/server/adapters/airwallex/schemaPayload';

const draft: BeneficiaryDraft = {
  companyName: 'Northwind Supplies GmbH',
  country: 'DE',
  currency: 'EUR',
  city: 'Berlin',
  state: 'Berlin',
  postcode: '10115',
  street: '1 Example Street',
  transferMethod: 'LOCAL',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankName: 'Commerzbank',
};

describe('beneficiary schema payload', () => {
  it('places required bank fields from the schema paths', () => {
    const fields = readApiSchema({
      fields: [
        { key: 'entity_type', path: 'beneficiary.entity_type', required: true, rule: { pattern: 'COMPANY|PERSONAL' } },
        { key: 'iban', path: 'beneficiary.bank_details.iban', required: true, rule: { pattern: '^[A-Z0-9]+$' } },
        { key: 'account_currency', path: 'beneficiary.bank_details.account_currency', required: true },
        { key: 'transfer_method', path: 'transfer_method', required: true, rule: { pattern: 'LOCAL|SWIFT' } },
        { key: 'date_of_birth', path: 'beneficiary.date_of_birth', required: false },
      ],
    });
    const body = buildBeneficiaryBody(fields, draft);
    expect(body).toMatchObject({
      transfer_method: 'LOCAL',
      transfer_methods: ['LOCAL'],
      beneficiary: {
        type: 'BANK_ACCOUNT',
        entity_type: 'COMPANY',
        bank_details: { iban: draft.iban, account_currency: 'EUR' },
      },
    });
    expect(body.beneficiary).not.toHaveProperty('date_of_birth');
  });

  it('uses an exact routing-type pattern when the draft has none', () => {
    const body = buildBeneficiaryBody(
      [
        {
          key: 'account_routing_type1',
          path: 'beneficiary.bank_details.account_routing_type1',
          required: true,
          pattern: '^sort_code$',
        },
      ],
      { ...draft, country: 'GB', currency: 'GBP', transferMethod: 'LOCAL' },
    );
    expect(body).toMatchObject({
      beneficiary: { bank_details: { account_routing_type1: 'sort_code' } },
    });
  });
});
