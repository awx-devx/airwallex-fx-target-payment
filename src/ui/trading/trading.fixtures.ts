import type { BeneficiarySummary, QuoteSummary } from '@/contracts/airwallex';
import { BILL_EVENT_TYPES, type BillEvent } from '@/contracts/events';
import { SimulatedMarket } from '@/mocks/market';

const market = new SimulatedMarket(7, [
  { base: 'EUR', quote: 'USD', price: '1.0862', vol: '0.0008' },
]);

export const EUR_USD_TICKS: readonly string[] = Array.from({ length: 32 }, (_, index) => {
  const tick = market.step(1_700_000_000 + index)[0];
  return tick?.price ?? '1.0862';
});

export const PAIR = { base: 'EUR', quote: 'USD' } as const;
export const NOW = '2026-10-01T12:00:00.000Z';

export const QUOTE: QuoteSummary = {
  airwallexQuoteId: 'qt_6f2c1a',
  price: '1.0748',
  sellAmount: '268430.12',
  buyAmount: '249750',
  clientRate: '1.0748',
  clientRateOriented: '1.0748',
  midPrice: '1.0742',
  spreadBps: 5.6,
  validity: 'MIN_1',
  validFromAt: '2026-10-01T11:59:15.000Z',
  validToAt: '2026-10-01T12:00:15.000Z',
  usage: 'SINGLE_USE',
  conversionDate: '2026-10-02',
};

export function beneficiary(
  patch: Partial<BeneficiarySummary> = {},
): BeneficiarySummary {
  return {
    id: 'ben_1',
    airwallexBeneficiaryId: 'awx_ben_1',
    name: 'Helios GmbH',
    entityType: 'COMPANY',
    bankCountry: 'DE',
    accountCurrency: 'EUR',
    bankName: 'Deutsche Bank',
    maskedAccount: '•••• 4321',
    transferMethods: ['LOCAL', 'SWIFT'],
    verification: {
      code: 'VERIFIED',
      nameMatch: 'FULL_MATCH',
      checkedAt: NOW,
    },
    ...patch,
  };
}

export const EVENTS: BillEvent[] = BILL_EVENT_TYPES.map((type, index) => ({
  id: `ev-${type}`,
  billId: 'bill_1',
  ts: `2026-10-01T12:${String(index).padStart(2, '0')}:00.000Z`,
  type,
  actor: type === 'QUOTE_LOCKED' || type === 'AUTOSETTLE' ? 'system' : 'user:ada',
}));
