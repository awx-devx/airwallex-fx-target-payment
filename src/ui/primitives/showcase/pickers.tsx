'use client';

import { CURRENCIES, type CurrencyInfo } from '@/contracts/currencies';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import type { TransferMethod } from '@/contracts/airwallex';
import type { Showcase } from '@/ui/showcase/types';
import { Calendar, DateInput } from '@/ui/primitives/date-input';
import { Flag } from '@/ui/primitives/flag';
import { CurrencySelect } from '@/ui/primitives/currency-select';
import { Combobox, OptionList, Select, type SelectOption } from '@/ui/primitives/select';
import {
  TransferMethodPicker,
} from '@/ui/primitives/transfer-method-picker';
import type { TransferMethodOption } from '@/ui/primitives/transfer-method';
import { Cell } from '@/ui/primitives/showcase/frame';

const CURRENCY_OPTIONS: SelectOption[] = [
  {
    value: 'EUR',
    label: 'EUR · Euro',
    description: 'SEPA',
    icon: <Flag currency="EUR" />,
  },
  {
    value: 'USD',
    label: 'USD · US dollar',
    description: 'Wire',
    icon: <Flag currency="USD" />,
  },
  {
    value: 'JPY',
    label: 'JPY · Yen',
    icon: <Flag currency="JPY" />,
  },
];

const BANKS: SelectOption[] = [
  { value: 'db', label: 'Deutsche Bank', description: 'DEUTDEFF' },
  { value: 'hsbc', label: 'HSBC', description: 'HBUKGB4B' },
  { value: 'citi', label: 'Citibank', description: 'CITIUS33' },
  { value: 'mufg', label: 'MUFG', description: 'BOTKJPJT' },
];

const CODES = ['EUR', 'USD', 'GBP', 'JPY', 'BHD', 'IDR', 'KES'];

function sampleCurrencies(): CurrencyInfo[] {
  return CURRENCIES.filter((currency) => CODES.includes(currency.code)).map(
    (currency) =>
      currency.code === 'USD'
        ? { ...currency, enabledOnAccount: { buy: false, sell: true } }
        : currency,
  );
}

const METHODS: TransferMethodOption[] = [
  {
    method: 'LOCAL',
    flightTime: { min: 'P0D', max: 'P3D' },
    transferLimit: { max: { amount: '10000', currency: 'USD' } },
  },
  {
    method: 'SWIFT',
    flightTime: { min: 'P1D', max: 'P3D' },
    transferLimit: { max: { amount: '1000000', currency: 'USD' } },
  },
];

function Selects() {
  const [value, setValue] = useState('EUR');
  const [bank, setBank] = useState('');
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Cell label="sm">
        <Select
          size="sm"
          label="Currency sm"
          value={value}
          onValueChange={setValue}
          options={CURRENCY_OPTIONS}
        />
      </Cell>
      <Cell label="md with description">
        <Select label="Currency" value={value} onValueChange={setValue} options={CURRENCY_OPTIONS} />
      </Cell>
      <Cell label="open">
        <OptionList options={CURRENCY_OPTIONS} empty="No results" onPick={() => undefined} />
      </Cell>
      <Cell label="empty">
        <OptionList options={[]} empty="No results" onPick={() => undefined} />
      </Cell>
      <Cell label="loading">
        <OptionList options={[]} empty="No results" busy onPick={() => undefined} />
      </Cell>
      <Cell label="truncated">
        <OptionList
          options={BANKS.slice(0, 2)}
          empty="No results"
          truncated
          onPick={() => undefined}
        />
      </Cell>
      <Cell label="searchable" className="sm:col-span-2">
        <Combobox
          label="Bank"
          placeholder="Search banks"
          options={BANKS}
          value={bank}
          onValueChange={setBank}
          expanded
        />
      </Cell>
    </div>
  );
}

function Currencies() {
  const currencies = sampleCurrencies();
  const [buy, setBuy] = useState('EUR');
  const [sell, setSell] = useState('EUR');
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Cell label="buy · USD disabled on account">
        <CurrencySelect
          label="Buy currency"
          mode="buy"
          currencies={currencies}
          value={buy}
          onValueChange={setBuy}
          expanded
        />
      </Cell>
      <Cell label="sell · BHD buy-only">
        <CurrencySelect
          label="Sell currency"
          mode="sell"
          currencies={currencies}
          value={sell}
          onValueChange={setSell}
          expanded
        />
      </Cell>
    </div>
  );
}

function Dates() {
  const [value, setValue] = useState('2026-10-15');
  const today = parseISO('2026-10-01');
  const closed = [{ date: '2026-10-05', reason: 'Public holiday' }];
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Cell label="business days left" className="w-56">
        <DateInput
          today="2026-10-01"
          value={value}
          onValueChange={setValue}
          disableWeekends
          closedDays={closed}
        />
      </Cell>
      <Cell label="past date" className="w-56">
        <DateInput today="2026-10-01" value="2026-09-20" onValueChange={() => undefined} />
      </Cell>
      <Cell label="weekends and holiday disabled">
        <Calendar
          today={today}
          selected={parseISO(value)}
          disableWeekends
          closedDays={closed}
          onPick={(date) => setValue(format(date, 'yyyy-MM-dd'))}
        />
        <p className="mt-2 text-fg-3">5 Oct is struck out: Public holiday.</p>
      </Cell>
    </div>
  );
}

function Methods() {
  const [selected, setSelected] = useState<TransferMethod>('LOCAL');
  const [over, setOver] = useState<TransferMethod>('SWIFT');
  const [only, setOnly] = useState<TransferMethod>('SWIFT');
  const [fallback, setFallback] = useState<TransferMethod>('LOCAL');
  return (
    <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
      <Cell label="selected">
        <TransferMethodPicker
          value={selected}
          onValueChange={setSelected}
          options={METHODS}
          amount="2500"
        />
      </Cell>
      <Cell label="over LOCAL limit">
        <TransferMethodPicker
          value={over}
          onValueChange={setOver}
          options={METHODS}
          amount="25000"
        />
      </Cell>
      <Cell label="single option">
        <TransferMethodPicker
          value={only}
          onValueChange={setOnly}
          options={METHODS[1] ? [METHODS[1]] : []}
          amount="2500"
        />
      </Cell>
      <Cell label="no schema · fallback lead">
        <TransferMethodPicker
          value={fallback}
          onValueChange={setFallback}
          options={[{ method: 'LOCAL' }, { method: 'SWIFT' }]}
        />
      </Cell>
    </div>
  );
}

export const pickerShowcases: Showcase[] = [
  {
    id: 'select',
    group: 'primitives',
    title: 'Select and Combobox',
    importPath: '@/ui/primitives/select',
    sections: [
      {
        id: 'select-matrix',
        title: 'Open, empty, loading, truncated',
        render: () => <Selects />,
      },
    ],
  },
  {
    id: 'currency',
    group: 'primitives',
    title: 'CurrencySelect',
    importPath: '@/ui/primitives/currency-select',
    description: 'Pure conversion and payout-only groups. Disabled rows explain why.',
    sections: [{ id: 'currency-matrix', title: 'Capability and account', render: () => <Currencies /> }],
  },
  {
    id: 'date',
    group: 'primitives',
    title: 'DateInput',
    importPath: '@/ui/primitives/date-input',
    description: 'Today is fixed at 2026-10-01 so the kit does not depend on the clock.',
    sections: [{ id: 'date-matrix', title: 'Calendar, holiday, past date', render: () => <Dates /> }],
  },
  {
    id: 'transfer-method',
    group: 'primitives',
    title: 'TransferMethodPicker',
    importPath: '@/ui/primitives/transfer-method-picker',
    sections: [
      {
        id: 'transfer-method-matrix',
        title: 'Flight time, limit, fallback',
        render: () => <Methods />,
      },
    ],
  },
];
