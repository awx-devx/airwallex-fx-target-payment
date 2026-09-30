import {
  GENERATOR_TRANSFER_REASONS,
  type TransferReason,
} from '@/contracts/airwallex';
import type { BillState } from '@/contracts/bill';
import type { BankDetails } from '@/mocks/generators/bankDetails';
import { generateBank } from '@/mocks/generators/bankDetails';
import {
  CORRIDORS,
  type Corridor,
  requireCorridor,
} from '@/mocks/generators/corridors';
import { addDays } from '@/mocks/generators/dates';
import {
  generateInvoice,
  TEMPLATES,
  VARIANTS,
  type InvoiceTruth,
  type Template,
  type Variant,
} from '@/mocks/generators/invoices';
import { profileSlots, type ProfileName } from '@/mocks/generators/profiles';
import { createRng, type Rng } from '@/mocks/generators/rng';
import { generateVendor, type Vendor } from '@/mocks/generators/vendors';

export const GENERATOR_VERSION = 1;
export const DEFAULT_AS_OF = '2026-10-01';

export type { ProfileName } from '@/mocks/generators/profiles';

export interface BillPlan {
  index: number;
  seedKey: string;
  state: BillState;
  currency: string;
  amount: string;
  dueDate: string;
  issueDate: string;
  targetDistanceBps?: number;
  strategyMode?: 'TARGET_RATE' | 'MAX_COST';
  transferMethod: 'LOCAL' | 'SWIFT';
  transferReason: TransferReason;
  invoiceIndex: number;
}

export interface Snapshot {
  generatorVersion: typeof GENERATOR_VERSION;
  seed: number;
  profile: ProfileName;
  asOf: string;
  homeCurrency: string;
  vendors: Vendor[];
  banks: BankDetails[];
  invoices: InvoiceTruth[];
  bills: BillPlan[];
}

function corridorAt(index: number): Corridor {
  const corridor = CORRIDORS[index % CORRIDORS.length];
  if (!corridor) throw new Error('No generator corridors configured');
  return corridor;
}

function homeCorridor(home: string): Corridor {
  if (home === 'USD') {
    return {
      currency: 'USD',
      country: 'US',
      method: 'LOCAL',
      taxRate: '0',
      unitMin: '100',
      unitMax: '5000',
      legalSuffix: 'Inc',
      kind: 'aba',
    };
  }
  return requireCorridor(home);
}

function pushInvoice(input: {
  rng: Rng;
  seed: number;
  index: number;
  corridor: Corridor;
  asOf: string;
  dueDate: string;
  template: Template;
  variant: Variant;
  vendors: Vendor[];
  banks: BankDetails[];
  invoices: InvoiceTruth[];
}): InvoiceTruth {
  const vendor = generateVendor(input.seed, input.index, input.corridor);
  const bank =
    input.variant === 'missing-bank'
      ? undefined
      : generateBank(input.rng, {
          country: input.corridor.country,
          currency: input.corridor.currency,
          accountName: vendor.name,
          kind: input.corridor.kind,
          bankCode: input.corridor.bankCode,
          bic: input.corridor.bic,
          bbanLength: input.corridor.bbanLength,
        });
  const invoice = generateInvoice({
    rng: input.rng,
    seed: input.seed,
    index: input.index,
    template: input.template,
    variant: input.variant,
    vendor,
    corridor: input.corridor,
    bank,
    asOf: input.asOf,
    dueDate: input.dueDate,
  });
  input.vendors.push(vendor);
  if (bank) input.banks.push(bank);
  input.invoices.push(invoice);
  return invoice;
}

export function generateSnapshot(input: {
  seed: number;
  profile?: ProfileName;
  asOf?: string;
  count?: number;
  currencies?: string[];
  states?: BillState[];
  homeCurrency?: string;
}): Snapshot {
  const seed = input.seed;
  const profile = input.profile ?? 'mixed';
  const asOf = input.asOf ?? DEFAULT_AS_OF;
  const homeCurrency = input.homeCurrency ?? 'USD';
  const rng = createRng(seed >>> 0);
  const vendors: Vendor[] = [];
  const banks: BankDetails[] = [];
  const invoices: InvoiceTruth[] = [];
  const bills: BillPlan[] = [];

  if (profile === 'extraction') {
    let index = 0;
    for (const template of TEMPLATES) {
      for (const variant of VARIANTS) {
        const corridor =
          variant === 'foreign-home'
            ? homeCorridor(homeCurrency)
            : corridorAt(index);
        pushInvoice({
          rng,
          seed,
          index,
          corridor,
          asOf,
          dueDate: addDays(asOf, 30),
          template,
          variant,
          vendors,
          banks,
          invoices,
        });
        index += 1;
      }
    }
    const clean = invoices.find((invoice) => invoice.variant === 'clean');
    if (clean) {
      for (const invoice of invoices) {
        if (invoice.variant !== 'duplicate') continue;
        invoice.invoiceNumber = clean.invoiceNumber;
        invoice.vendor = { ...clean.vendor };
      }
    }
    return {
      generatorVersion: GENERATOR_VERSION,
      seed,
      profile,
      asOf,
      homeCurrency,
      vendors,
      banks,
      invoices,
      bills,
    };
  }

  if (profile === 'upload') {
    const variants: Variant[] = [
      'clean',
      'scanned',
      'missing-bank',
      'ambiguous-dates',
      'clean',
    ];
    variants.forEach((variant, index) => {
      pushInvoice({
        rng,
        seed,
        index,
        corridor: corridorAt(index),
        asOf,
        dueDate: addDays(asOf, 14),
        template: 'classic',
        variant,
        vendors,
        banks,
        invoices,
      });
    });
    return {
      generatorVersion: GENERATOR_VERSION,
      seed,
      profile,
      asOf,
      homeCurrency,
      vendors,
      banks,
      invoices,
      bills,
    };
  }

  let slots = profileSlots(profile, asOf);
  if (input.count !== undefined || input.currencies || input.states) {
    const count = input.count ?? slots.length;
    const currencies = input.currencies ?? slots.map((slot) => slot.currency);
    const states = input.states ?? slots.map((slot) => slot.state);
    slots = Array.from({ length: count }, (_, index) => ({
      state: states[index % states.length] ?? 'WATCHING',
      currency: currencies[index % currencies.length] ?? 'EUR',
      dueDate: addDays(asOf, 14),
      targetDistanceBps: 80,
      strategyMode: 'TARGET_RATE' as const,
    }));
  }

  slots.forEach((slot, index) => {
    if (slot.currency === homeCurrency) {
      throw new Error(
        `Bill currency ${slot.currency} matches the home currency`,
      );
    }
    const corridor = requireCorridor(slot.currency);
    const invoice = pushInvoice({
      rng,
      seed,
      index,
      corridor,
      asOf,
      dueDate: slot.dueDate,
      template:
        slot.template ?? TEMPLATES[index % TEMPLATES.length] ?? 'classic',
      variant: slot.variant ?? 'clean',
      vendors,
      banks,
      invoices,
    });
    bills.push({
      index,
      seedKey: `gen:v${GENERATOR_VERSION}:${seed}:${index}`,
      state: slot.state,
      currency: slot.currency,
      amount: invoice.total,
      dueDate: invoice.dueDate,
      issueDate: invoice.issueDate,
      targetDistanceBps: slot.targetDistanceBps,
      strategyMode: slot.strategyMode,
      transferMethod: slot.transferMethod ?? corridor.method,
      transferReason: rng.pick(GENERATOR_TRANSFER_REASONS),
      invoiceIndex: index,
    });
  });

  return {
    generatorVersion: GENERATOR_VERSION,
    seed,
    profile,
    asOf,
    homeCurrency,
    vendors,
    banks,
    invoices,
    bills,
  };
}
