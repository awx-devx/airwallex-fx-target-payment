'use client';

import {
  FAILURE_CATEGORIES,
  TRANSFER_STATUSES,
  type BeneficiarySummary,
} from '@/contracts/airwallex';
import { BILL_STATES } from '@/contracts/bill';
import { useState } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import { Cell, Matrix } from '@/ui/primitives/showcase/frame';
import { ActivityItem } from '@/ui/trading/activity-item';
import { BalancePill } from '@/ui/trading/balance-pill';
import { BeneficiaryCard } from '@/ui/trading/beneficiary-card';
import { ConnectionIndicator } from '@/ui/trading/connection-indicator';
import { EnvBadge } from '@/ui/trading/env-badge';
import { ExtractionField } from '@/ui/trading/extraction-field';
import { ShortcutHint } from '@/ui/trading/shortcut-hint';
import { StateBadge } from '@/ui/trading/state-badge';
import { TransferStatusPill } from '@/ui/trading/transfer-status-pill';
import { EVENTS, NOW, beneficiary } from '@/ui/trading/trading.fixtures';

const BALANCE = {
  currency: 'USD' as const,
  available: '84210.55',
  pending: '1200',
  reserved: '268430.12',
  total: '353840.67',
  asOf: NOW,
};

function ConfirmCard({
  beneficiary: value,
}: {
  beneficiary: BeneficiarySummary;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <BeneficiaryCard
      beneficiary={value}
      confirmed={confirmed}
      onConfirmedChange={setConfirmed}
    />
  );
}

export const statusShowcases: Showcase[] = [
  {
    id: 'state-badge',
    group: 'trading',
    title: 'StateBadge',
    importPath: '@/ui/trading/state-badge',
    sections: [
      {
        id: 'state-badge-matrix',
        title: 'Every bill state',
        render: () => (
          <Matrix>
            {BILL_STATES.map((state) => (
              <Cell key={state} label={state}>
                <StateBadge state={state} />
              </Cell>
            ))}
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'transfer-status',
    group: 'trading',
    title: 'TransferStatusPill',
    importPath: '@/ui/trading/transfer-status-pill',
    sections: [
      {
        id: 'transfer-status-matrix',
        title: 'Every status, late failure, next step',
        render: () => (
          <div className="grid gap-3">
            {TRANSFER_STATUSES.map((status) => (
              <TransferStatusPill
                key={status}
                status={status}
                category={status === 'FAILED' ? 'BENEFICIARY_DETAILS' : undefined}
              />
            ))}
            <TransferStatusPill status="PAID" lateFailure />
            {FAILURE_CATEGORIES.map((category) => (
              <TransferStatusPill key={category} status="FAILED" category={category} />
            ))}
          </div>
        ),
      },
    ],
  },
  {
    id: 'connection',
    group: 'trading',
    title: 'ConnectionIndicator',
    importPath: '@/ui/trading/connection-indicator',
    sections: [
      {
        id: 'connection-matrix',
        title: 'Live, delayed, offline, simulated',
        render: () => (
          <Matrix>
            <ConnectionIndicator state="live" />
            <ConnectionIndicator state="delayed" />
            <ConnectionIndicator state="offline" />
            <ConnectionIndicator state="simulated" />
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'env-badge',
    group: 'trading',
    title: 'EnvBadge',
    importPath: '@/ui/trading/env-badge',
    sections: [
      {
        id: 'env-badge-matrix',
        title: 'Sandbox, production, demo',
        render: () => (
          <Matrix>
            <EnvBadge env="SANDBOX" />
            <EnvBadge env="PRODUCTION" />
            <EnvBadge env="DEMO" />
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'balance-pill',
    group: 'trading',
    title: 'BalancePill',
    importPath: '@/ui/trading/balance-pill',
    sections: [
      {
        id: 'balance-pill-matrix',
        title: 'Normal, low, insufficient',
        render: () => (
          <Matrix>
            <Cell label="normal"><BalancePill balance={BALANCE} /></Cell>
            <Cell label="low"><BalancePill balance={BALANCE} tone="low" /></Cell>
            <Cell label="insufficient"><BalancePill balance={BALANCE} tone="insufficient" /></Cell>
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'activity',
    group: 'trading',
    title: 'ActivityItem',
    importPath: '@/ui/trading/activity-item',
    sections: [
      {
        id: 'activity-matrix',
        title: 'Every event',
        render: () => (
          <div className="grid max-w-md gap-2">
            {EVENTS.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </div>
        ),
      },
    ],
  },
  {
    id: 'extraction-field',
    group: 'trading',
    title: 'ExtractionField',
    importPath: '@/ui/trading/extraction-field',
    sections: [
      {
        id: 'extraction-matrix',
        title: 'Confidence, edited, missing',
        render: () => (
          <div className="grid max-w-sm gap-2">
            <ExtractionField label="Vendor" value="Helios GmbH" confidence="high" />
            <ExtractionField label="Amount" value="250,000.00 EUR" confidence="medium" />
            <ExtractionField label="Due" value="31 Dec 2026" confidence="low" edited />
            <ExtractionField label="IBAN" missing />
          </div>
        ),
      },
    ],
  },
  {
    id: 'beneficiary-card',
    group: 'trading',
    title: 'BeneficiaryCard',
    importPath: '@/ui/trading/beneficiary-card',
    sections: [
      {
        id: 'beneficiary-matrix',
        title: 'Verification results',
        render: () => (
          <div className="grid gap-3 lg:grid-cols-2">
            <BeneficiaryCard beneficiary={beneficiary()} />
            <ConfirmCard
              beneficiary={beneficiary({
                verification: {
                  code: 'VERIFIED',
                  nameMatch: 'PARTIAL_MATCH',
                  resolvedAccountName: 'Helios GMBH',
                  checkedAt: NOW,
                },
              })}
            />
            <ConfirmCard
              beneficiary={beneficiary({
                verification: {
                  code: 'VERIFIED',
                  nameMatch: 'FULL_MATCH_INCORRECT_TYPE',
                  resolvedAccountName: 'Helios',
                  checkedAt: NOW,
                },
              })}
            />
            <ConfirmCard
              beneficiary={beneficiary({
                verification: {
                  code: 'VERIFIED',
                  nameMatch: 'PARTIAL_MATCH_INCORRECT_TYPE',
                  resolvedAccountName: 'Helios G',
                  checkedAt: NOW,
                },
              })}
            />
            <ConfirmCard
              beneficiary={beneficiary({
                verification: {
                  code: 'VERIFIED',
                  nameMatch: 'NOT_MATCHED',
                  resolvedAccountName: 'Other Ltd',
                  checkedAt: NOW,
                },
              })}
            />
            <BeneficiaryCard
              beneficiary={beneficiary({
                verification: { code: 'INVALID', checkedAt: NOW },
              })}
            />
            <BeneficiaryCard
              beneficiary={beneficiary({
                verification: { code: 'CANNOT_VERIFY', checkedAt: NOW },
              })}
            />
            <BeneficiaryCard
              beneficiary={beneficiary({
                verification: { code: 'EXTERNAL_SERVICE_UNAVAILABLE', checkedAt: NOW },
              })}
            />
            <BeneficiaryCard
              beneficiary={beneficiary({
                verification: { code: 'NOT_SUPPORTED', checkedAt: NOW },
                bankName: undefined,
              })}
              missing={['bank name']}
            />
            <BeneficiaryCard error="Verification service is unavailable." />
          </div>
        ),
      },
    ],
  },
  {
    id: 'shortcut-hint',
    group: 'trading',
    title: 'ShortcutHint',
    importPath: '@/ui/trading/shortcut-hint',
    sections: [
      {
        id: 'shortcut-hint-matrix',
        title: 'Floating hints',
        render: () => (
          <Matrix>
            <ShortcutHint keys={['J']} label="Next bill" />
            <ShortcutHint keys={['⌘', 'K']} label="Command" />
          </Matrix>
        ),
      },
    ],
  },
];
