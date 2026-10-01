'use client';

import { useState } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import { Button } from '@/ui/primitives/button';
import { Cell, Matrix } from '@/ui/primitives/showcase/frame';
import { CostBreakdown } from '@/ui/trading/cost-breakdown';
import { KeyValueList } from '@/ui/trading/key-value-list';
import { MoneyDisplay } from '@/ui/trading/money-display';
import { QuoteCard } from '@/ui/trading/quote-card';
import { SavingsCell } from '@/ui/trading/savings-cell';
import { StrategySummary } from '@/ui/trading/strategy-summary';
import { NOW, PAIR, QUOTE } from '@/ui/trading/trading.fixtures';

function SavingsDemo() {
  const [savings, setSavings] = useState('1200.5');
  return (
    <div className="space-y-2">
      <SavingsCell currency="USD" savings={savings} savingsPct="0.01" />
      <Button size="sm" variant="secondary" onClick={() => setSavings(savings === '1200.5' ? '-80' : '1200.5')}>
        Tween
      </Button>
    </div>
  );
}

export const bookShowcases: Showcase[] = [
  {
    id: 'money-display',
    group: 'trading',
    title: 'MoneyDisplay',
    importPath: '@/ui/trading/money-display',
    sections: [
      {
        id: 'money-display-matrix',
        title: 'Sizes, signed, masked, zero-decimal',
        render: () => (
          <Matrix>
            <Cell label="sm"><MoneyDisplay currency="USD" value="271430.12" size="sm" /></Cell>
            <Cell label="md"><MoneyDisplay currency="USD" value="271430.12" /></Cell>
            <Cell label="lg"><MoneyDisplay currency="USD" value="271430.12" size="lg" /></Cell>
            <Cell label="hero"><MoneyDisplay currency="USD" value="271430.12" size="hero" /></Cell>
            <Cell label="signed"><MoneyDisplay currency="USD" value="1200.5" signed /></Cell>
            <Cell label="negative"><MoneyDisplay currency="USD" value="-80" signed /></Cell>
            <Cell label="KES"><MoneyDisplay currency="KES" value="100.5" /></Cell>
            <Cell label="masked"><MoneyDisplay currency="USD" value="271430.12" masked /></Cell>
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'savings',
    group: 'trading',
    title: 'SavingsCell',
    importPath: '@/ui/trading/savings-cell',
    sections: [
      {
        id: 'savings-matrix',
        title: 'Positive, negative, zero, tween',
        render: () => (
          <div className="grid gap-3">
            <SavingsCell currency="USD" savings="1200.5" savingsPct="0.01" />
            <SavingsCell currency="USD" savings="-80" savingsPct="-0.01" />
            <SavingsCell currency="USD" savings="0" savingsPct="0" />
            <SavingsDemo />
          </div>
        ),
      },
    ],
  },
  {
    id: 'key-value',
    group: 'trading',
    title: 'KeyValueList',
    importPath: '@/ui/trading/key-value-list',
    sections: [
      {
        id: 'key-value-matrix',
        title: 'Dense rows',
        render: () => (
          <div className="max-w-sm">
            <KeyValueList
              rows={[
                { label: 'Vendor', value: 'Helios GmbH' },
                { label: 'Invoice', value: 'INV-2041' },
                { label: 'Method', value: 'SWIFT' },
              ]}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'cost-breakdown',
    group: 'trading',
    title: 'CostBreakdown',
    importPath: '@/ui/trading/cost-breakdown',
    sections: [
      {
        id: 'cost-breakdown-matrix',
        title: 'Estimated, tentative, locked',
        render: () => (
          <div className="grid gap-6 lg:grid-cols-3">
            <CostBreakdown
              pair={PAIR}
              billAmount="250000"
              billCurrency="EUR"
              price="1.0842"
              homeCurrency="USD"
              entryPrice="1.09"
              targetPrice="1.075"
              feeUnknown
            />
            <CostBreakdown
              pair={PAIR}
              billAmount="250000"
              billCurrency="EUR"
              price="1.0748"
              homeCurrency="USD"
              mode="tentative"
              fee={{ amount: '12.5', currency: 'USD', paidBy: 'PAYER' }}
              swiftChargeOption="PAYER"
              vendorReceives="249750"
              invoiceAmount="250000"
            />
            <CostBreakdown
              pair={PAIR}
              billAmount="250000"
              billCurrency="EUR"
              price="1.0748"
              homeCurrency="USD"
              mode="locked"
              total="268942.5"
              fee={{ amount: '12.5', currency: 'USD', paidBy: 'BENEFICIARY' }}
              swiftChargeOption="SHARED"
              vendorReceives="250000"
              invoiceAmount="250000"
              entryPrice="1.09"
              targetPrice="1.075"
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'strategy',
    group: 'trading',
    title: 'StrategySummary',
    importPath: '@/ui/trading/strategy-summary',
    sections: [
      {
        id: 'strategy-matrix',
        title: 'Rate, max cost, not set',
        render: () => (
          <div className="grid gap-2">
            <StrategySummary
              pair={PAIR}
              mode="TARGET_RATE"
              targetPrice="1.075"
              maxCost="268750"
              homeCurrency="USD"
            />
            <StrategySummary pair={PAIR} mode="MAX_COST" maxCost="268750" homeCurrency="USD" />
            <StrategySummary pair={PAIR} homeCurrency="USD" />
          </div>
        ),
      },
    ],
  },
  {
    id: 'quote-card',
    group: 'trading',
    title: 'QuoteCard',
    importPath: '@/ui/trading/quote-card',
    sections: [
      {
        id: 'quote-card-matrix',
        title: 'Target, deadline, expired, near miss',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            <QuoteCard quote={QUOTE} pair={PAIR} tone="target" now={NOW} homeCurrency="USD" fee="12.50" />
            <QuoteCard quote={QUOTE} pair={PAIR} tone="deadline" now={NOW} homeCurrency="USD" />
            <QuoteCard
              quote={{ ...QUOTE, validToAt: '2026-10-01T11:00:00.000Z' }}
              pair={PAIR}
              tone="expired"
              now={NOW}
              homeCurrency="USD"
            />
            <QuoteCard quote={QUOTE} pair={PAIR} tone="near-miss" now={NOW} homeCurrency="USD" />
          </div>
        ),
      },
    ],
  },
];
