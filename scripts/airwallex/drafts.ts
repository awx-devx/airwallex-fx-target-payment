import { generateBank } from '@/mocks/generators/bankDetails';
import { requireCorridor } from '@/mocks/generators/corridors';
import { createRng } from '@/mocks/generators/rng';
import type { BeneficiaryDraft } from '@/server/adapters/airwallex/schemaPayload';

const PLACES: Record<string, Pick<BeneficiaryDraft, 'city' | 'state' | 'postcode' | 'street'>> = {
  DE: { city: 'Berlin', state: 'Berlin', postcode: '10115', street: '1 Example Street' },
  GB: { city: 'London', state: 'London', postcode: 'SW1A 1AA', street: '1 Example Street' },
  JP: { city: 'Tokyo', state: 'Tokyo', postcode: '100-0001', street: '1 Example Street' },
  SG: { city: 'Singapore', state: 'Singapore', postcode: '018989', street: '1 Example Street' },
  IN: { city: 'Mumbai', state: 'IN-MH', postcode: '400001', street: '1 Example Street' },
  KE: { city: 'Nairobi', state: 'Nairobi', postcode: '00100', street: '1 Example Street' },
};

const KEYWORDS: Record<string, string> = {
  GB: 'BARCLAYS',
  JP: 'BOTKJPJT',
  SG: 'DBS',
  IN: 'HDFC BANK',
  KE: 'KCB',
};

export interface DraftPlan {
  draft: BeneficiaryDraft;
  keyword?: string;
  requestKey: string;
}

/** Stable fictional beneficiary for one corridor. The same currency always rebuilds the same bank details. */
export function draftPlan(currency: string, method?: 'LOCAL' | 'SWIFT'): DraftPlan {
  if (currency === 'KES') {
    return {
      requestKey: 'smoke:KES',
      keyword: KEYWORDS.KE,
      draft: {
        companyName: 'Savanna Goods Ltd',
        country: 'KE',
        currency: 'KES',
        transferMethod: 'LOCAL',
        accountNumber: '0100123456789',
        bankName: 'KCB Bank',
        phone: '+254-700000000',
        ...place('KE'),
      },
    };
  }
  const corridor = requireCorridor(currency);
  const transferMethod = method ?? corridor.method;
  const companyName = `Example ${currency} ${corridor.legalSuffix}`;
  const bank = generateBank(createRng(currency.charCodeAt(0) * 1000 + currency.charCodeAt(1)), {
    country: corridor.country,
    currency: corridor.currency,
    accountName: companyName,
    kind: corridor.kind,
    bankCode: corridor.bankCode,
    bic: corridor.bic,
    bbanLength: corridor.bbanLength,
  });
  return {
    requestKey: method && method !== corridor.method ? `seed:${currency}:${method}` : `seed:${currency}`,
    keyword: KEYWORDS[corridor.country],
    draft: {
      companyName,
      country: corridor.country,
      currency: corridor.currency,
      transferMethod,
      iban: bank.iban,
      bic: bank.bic ?? corridor.bic,
      accountNumber: bank.accountNumber,
      routingValue1:
        bank.sortCode ?? bank.ifsc ?? bank.bsb ?? bank.routingNumber ?? bank.bankCode ?? corridor.bankCode,
      bankName: companyName,
      ...place(corridor.country),
    },
  };
}

function place(country: string): Pick<BeneficiaryDraft, 'city' | 'state' | 'postcode' | 'street'> {
  return (
    PLACES[country] ?? {
      city: 'Example City',
      state: 'Example',
      postcode: '00000',
      street: '1 Example Street',
    }
  );
}
