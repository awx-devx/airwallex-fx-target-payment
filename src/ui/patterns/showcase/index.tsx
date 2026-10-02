'use client';

import type { BillSummary } from '@/contracts/bill';
import type { TransferStatus } from '@/contracts/airwallex';
import { useState } from 'react';
import { baseOverlays, WATCHING } from '@/ui/chart/chart.fixtures';
import { Cell } from '@/ui/primitives/showcase/frame';
import type { Showcase } from '@/ui/showcase/types';
import { BillList, BillListItem, PairGroupHeader } from '@/ui/patterns/bill-list';
import { BillTicket } from '@/ui/patterns/bill-ticket';
import { ArmConfirm } from '@/ui/patterns/arm-confirm';
import { CommandList } from '@/ui/patterns/command-palette';
import { DemoControlBar } from '@/ui/patterns/demo-control-bar';
import { ExtractionReview } from '@/ui/patterns/extraction-review';
import { NotificationList } from '@/ui/patterns/notification-center';
import { PositionsPanel, PositionsTable } from '@/ui/patterns/positions';
import {
  balances,
  billByState,
  billRows,
  events,
  executionCatalog,
  fieldErrorsByCorridor,
  formSchemaFor,
  manyRows,
  PATTERN_NOW,
} from '@/ui/patterns/pattern.fixtures';
import { SchemaForm } from '@/ui/patterns/schema-form';
import { SettingsForm, type SettingsValues } from '@/ui/patterns/settings-form';
import { ShortcutsSheet } from '@/ui/patterns/shortcuts-sheet';
import { SIM_PHASES, SimulateButton, type SimPhase } from '@/ui/patterns/simulate-button';
import { StrategyWizardStep } from '@/ui/patterns/strategy-wizard';
import { TopBar } from '@/ui/patterns/top-bar';
import { TransferTracker } from '@/ui/patterns/transfer-tracker';
import { UploadPreview, type UploadPhase } from '@/ui/patterns/upload-modal';
import { Button } from '@/ui/primitives/button';

const HOME = 'USD';
const rows = billRows();

function bill(state: BillSummary['state']): BillSummary {
  return billByState(state);
}

function ListDemo({
  empty = false,
  loading = false,
  virtualized = false,
  grouped = false,
}: {
  empty?: boolean;
  loading?: boolean;
  virtualized?: boolean;
  grouped?: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'watching' | 'paid'>('all');
  const [sort, setSort] = useState<'deadline' | 'distance' | 'amount'>('deadline');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(grouped);
  const source = virtualized ? manyRows() : rows;
  return (
    <div className="max-w-3xl">
      <BillList
        rows={empty ? [] : source}
        now={PATTERN_NOW}
        selectedId={source[2]?.bill.id}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        grouped={group}
        onGroupedChange={setGroup}
        query={query}
        onQueryChange={setQuery}
        loading={loading}
        virtualized={virtualized}
      />
    </div>
  );
}

function WizardDemo() {
  const ready = bill('READY');
  const [mode, setMode] = useState<'TARGET_RATE' | 'MAX_COST'>('TARGET_RATE');
  const [target, setTarget] = useState(ready.targetPrice ?? '1.07632');
  const [maxCost, setMaxCost] = useState('268750.00');
  return (
    <StrategyWizardStep
      pair={ready.pair}
      amount={ready.amount}
      mode={mode}
      onModeChange={setMode}
      target={target}
      onTargetChange={setTarget}
      maxCost={maxCost}
      onMaxCostChange={setMaxCost}
      homeCurrency={HOME}
      series={WATCHING}
      overlays={baseOverlays(WATCHING, { target, entry: '1.08500' })}
    />
  );
}

function SchemaDemo({
  country,
  currency,
  errors = false,
  loading = false,
  refreshing = false,
}: {
  country: string;
  currency: string;
  errors?: boolean;
  loading?: boolean;
  refreshing?: boolean;
}) {
  const schema = formSchemaFor(country, currency);
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <SchemaForm
      schema={loading ? undefined : schema}
      values={values}
      onValuesChange={setValues}
      loading={loading}
      refreshing={refreshing}
      errors={errors ? (fieldErrorsByCorridor[currency] ?? []) : []}
      banks={currency === 'GBP' ? [{ label: 'Barclays', routingValue: '200000' }] : []}
      onSearch={() => undefined}
      onRefresh={() => undefined}
    />
  );
}

const SETTINGS: SettingsValues = {
  homeCurrency: 'USD',
  leadDays: '2',
  validity: 'MIN_1',
  cutoff: '14:00',
  timeZone: 'America/Los_Angeles',
};

function execution(status: TransferStatus) {
  return executionCatalog.find((item) => item.status === status) ?? executionCatalog[0]!;
}

export const patternShowcases: Showcase[] = [
  {
    id: 'top-bar',
    group: 'patterns',
    title: 'TopBar',
    importPath: '@/ui/patterns/top-bar',
    sections: [
      {
        id: 'top-bar-matrix',
        title: 'Normal, demo, offline',
        render: () => (
          <div className="space-y-3">
            <TopBar balances={balances} now={PATTERN_NOW} unread={2} />
            <TopBar balances={balances} connection="simulated" now={PATTERN_NOW} warp="60×" unread={0} />
            <TopBar balances={balances} connection="offline" now={PATTERN_NOW} />
          </div>
        ),
      },
    ],
  },
  {
    id: 'bill-list-item',
    group: 'patterns',
    title: 'BillListItem',
    importPath: '@/ui/patterns/bill-list',
    sections: [
      {
        id: 'bill-list-item-matrix',
        title: 'States, selected, compact',
        render: () => (
          <div className="max-w-3xl">
            {rows.map((row) => (
              <BillListItem
                key={row.bill.id}
                bill={row.bill}
                sparkline={row.sparkline}
                now={PATTERN_NOW}
                selected={row.bill.state === 'WATCHING'}
              />
            ))}
            <BillListItem
              bill={bill('PAID')}
              sparkline={rows[0]!.sparkline}
              now={PATTERN_NOW}
              density="compact"
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'pair-group-header',
    group: 'patterns',
    title: 'PairGroupHeader',
    importPath: '@/ui/patterns/bill-list',
    sections: [
      {
        id: 'pair-group-header-matrix',
        title: 'Exposure and count',
        render: () => (
          <PairGroupHeader
            pair={{ base: 'EUR', quote: 'USD' }}
            bills={rows.filter((row) => row.bill.pair.base === 'EUR').map((row) => row.bill)}
          />
        ),
      },
    ],
  },
  {
    id: 'bill-list',
    group: 'patterns',
    title: 'BillList',
    importPath: '@/ui/patterns/bill-list',
    sections: [
      {
        id: 'bill-list-matrix',
        title: 'Populated, empty, loading, virtualised',
        render: () => (
          <div className="grid gap-4">
            <Cell label="populated">
              <ListDemo />
            </Cell>
            <Cell label="grouped">
              <ListDemo grouped />
            </Cell>
            <Cell label="empty">
              <ListDemo empty />
            </Cell>
            <Cell label="loading">
              <ListDemo loading />
            </Cell>
            <Cell label="many">
              <ListDemo virtualized />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'bill-ticket',
    group: 'patterns',
    title: 'BillTicket',
    importPath: '@/ui/patterns/bill-ticket',
    sections: [
      {
        id: 'bill-ticket-matrix',
        title: 'Ready through failed',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            {(['READY', 'WATCHING', 'PAUSED', 'EXECUTING', 'IN_FLIGHT', 'PAID', 'FAILED'] as const).map(
              (state) => (
                <Cell key={state} label={state} className="max-w-none">
                  <BillTicket
                    bill={bill(state)}
                    now={PATTERN_NOW}
                    events={events}
                    homeCurrency={HOME}
                    cutoffLabel="14:00 on Oct 9"
                  />
                </Cell>
              ),
            )}
          </div>
        ),
      },
    ],
  },
  {
    id: 'arm-confirm',
    group: 'patterns',
    title: 'ArmConfirm',
    importPath: '@/ui/patterns/arm-confirm',
    sections: [
      {
        id: 'arm-confirm-matrix',
        title: 'Missing consent, consented, target already met',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-3">
            <Cell label="missing consent">
              <ArmConfirm bill={bill('READY')} cutoffLabel="14:00 on Oct 9" consent={false} />
            </Cell>
            <Cell label="valid">
              <ArmConfirm bill={bill('READY')} cutoffLabel="14:00 on Oct 9" consent />
            </Cell>
            <Cell label="target met">
              <ArmConfirm
                bill={{ ...bill('READY'), lastPrice: '1.07000', targetPrice: '1.07632' }}
                cutoffLabel="14:00 on Oct 9"
                consent
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'strategy-wizard',
    group: 'patterns',
    title: 'StrategyWizardStep',
    importPath: '@/ui/patterns/strategy-wizard',
    sections: [
      {
        id: 'strategy-wizard-matrix',
        title: 'Rate mode with a draggable target',
        render: () => <WizardDemo />,
      },
    ],
  },
  {
    id: 'transfer-tracker',
    group: 'patterns',
    title: 'TransferTracker',
    importPath: '@/ui/patterns/transfer-tracker',
    sections: [
      {
        id: 'transfer-tracker-matrix',
        title: 'Status, funding, failure, late failure',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Cell label="processing">
              <TransferTracker execution={execution('PROCESSING')} advance={<Button size="xs" variant="secondary">Advance</Button>} />
            </Cell>
            <Cell label="needs funding">
              <TransferTracker execution={execution('IN_APPROVAL')} />
            </Cell>
            <Cell label="paid">
              <TransferTracker execution={execution('PAID')} />
            </Cell>
            <Cell label="beneficiary details">
              <TransferTracker
                execution={
                  executionCatalog.find((item) => item.failure?.category === 'BENEFICIARY_DETAILS') ??
                  execution('FAILED')
                }
              />
            </Cell>
            <Cell label="late failure">
              <TransferTracker execution={execution('PAID')} lateFailure />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'positions-table',
    group: 'patterns',
    title: 'PositionsTable',
    importPath: '@/ui/patterns/positions',
    sections: [
      {
        id: 'positions-table-matrix',
        title: 'Sortable rows, one selected',
        render: () => (
          <PositionsTable bills={rows.map((row) => row.bill)} selectedId={bill('WATCHING').id} />
        ),
      },
    ],
  },
  {
    id: 'positions-panel',
    group: 'patterns',
    title: 'PositionsPanel',
    importPath: '@/ui/patterns/positions',
    sections: [
      {
        id: 'positions-panel-matrix',
        title: 'Positions, executed, activity',
        render: () => (
          <PositionsPanel
            bills={rows.map((row) => row.bill).filter((item) => item.state === 'WATCHING' || item.state === 'PAUSED')}
            executed={[bill('PAID'), bill('EXECUTING')]}
            events={events}
            selectedId={bill('WATCHING').id}
          />
        ),
      },
    ],
  },
  {
    id: 'upload-modal',
    group: 'patterns',
    title: 'UploadModal',
    importPath: '@/ui/patterns/upload-modal',
    sections: [
      {
        id: 'upload-modal-matrix',
        title: 'Idle through partial failure',
        render: () => (
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ['idle', 'idle', []],
                ['dragging', 'dragging', []],
                ['uploading', 'uploading', [{ name: 'acme.pdf', progress: 40 }]],
                [
                  'extracting',
                  'extracting',
                  [
                    { name: 'queued.pdf', extraction: 'working' },
                    { name: 'readers.pdf', extraction: 'searching' },
                    { name: 'model.pdf', extraction: 'solving' },
                  ],
                ],
                ['ready', 'extracting', [{ name: 'acme.pdf', progress: 100 }]],
                ['partial', 'partial', [{ name: 'acme.pdf', progress: 100 }, { name: 'bad.xml', error: 'Unreadable' }]],
                ['samples', 'samples', []],
              ] as [
                string,
                UploadPhase,
                { name: string; progress?: number; error?: string; extraction?: 'working' | 'searching' | 'solving' }[],
              ][]
            ).map(([label, phase, files]) => (
              <Cell key={label} label={label}>
                <UploadPreview phase={phase} files={files} />
              </Cell>
            ))}
          </div>
        ),
      },
    ],
  },
  {
    id: 'extraction-review',
    group: 'patterns',
    title: 'ExtractionReview',
    importPath: '@/ui/patterns/extraction-review',
    sections: [
      {
        id: 'extraction-review-matrix',
        title: 'Confidence, missing bank, duplicate, field errors',
        render: () => (
          <div className="space-y-6">
            <ExtractionReview
              fileName="AC-2026-0142.pdf"
              index={0}
              total={3}
              reference="ACME-0142"
              reason="goods_purchased"
              beneficiary={bill('READY').beneficiary}
              fields={[
                { label: 'Vendor', value: 'Acme GmbH', confidence: 'high' },
                { label: 'Amount', value: '250,000.00 EUR', confidence: 'medium', edited: true },
                { label: 'Due', value: '13 Oct 2026', confidence: 'high' },
              ]}
            />
            <ExtractionReview
              fileName="missing-bank.pdf"
              index={1}
              total={3}
              reference=""
              duplicate
              fieldErrors={fieldErrorsByCorridor.EUR ?? []}
              fields={[
                { label: 'Vendor', value: 'Unknown', confidence: 'low' },
                { label: 'IBAN', missing: true, confidence: 'low' },
              ]}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'schema-form',
    group: 'patterns',
    title: 'SchemaForm',
    importPath: '@/ui/patterns/schema-form',
    sections: [
      {
        id: 'schema-form-matrix',
        title: 'EUR, GBP, INR, USD, loading, errors',
        render: () => (
          <div className="grid gap-6 lg:grid-cols-2">
            <Cell label="EUR IBAN">
              <SchemaDemo country="DE" currency="EUR" />
            </Cell>
            <Cell label="GBP sort code">
              <SchemaDemo country="GB" currency="GBP" />
            </Cell>
            <Cell label="INR IFSC">
              <SchemaDemo country="IN" currency="INR" />
            </Cell>
            <Cell label="USD ACH">
              <SchemaDemo country="US" currency="USD" />
            </Cell>
            <Cell label="loading">
              <SchemaDemo country="DE" currency="EUR" loading />
            </Cell>
            <Cell label="field errors">
              <SchemaDemo country="DE" currency="EUR" errors />
            </Cell>
            <Cell label="refetching">
              <SchemaDemo country="DE" currency="EUR" refreshing />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'notification-center',
    group: 'patterns',
    title: 'NotificationCenter',
    importPath: '@/ui/patterns/notification-center',
    sections: [
      {
        id: 'notification-center-matrix',
        title: 'Unread, read, action required',
        render: () => (
          <NotificationList
            notices={[
              { id: '1', billId: 'bill-target-hit', vendor: 'Acme GmbH', title: 'Target hit · paying', unread: true },
              { id: '2', billId: 'bill-target-hit', vendor: 'Acme GmbH', title: 'Quote locked', unread: false },
              { id: '3', billId: 'bill-failed', vendor: 'Northwind', title: 'Transfer failed', unread: true, action: 'Fix' },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: 'command-palette',
    group: 'patterns',
    title: 'CommandPalette',
    importPath: '@/ui/patterns/command-palette',
    sections: [
      {
        id: 'command-palette-matrix',
        title: 'Bills and actions',
        render: () => (
          <CommandList
            query=""
            onQueryChange={() => undefined}
            items={[
              { id: '1', group: 'Bills', label: 'Acme GmbH · EUR' },
              { id: '2', group: 'Bills', label: 'Harbour Supplies · AUD' },
              { id: '3', group: 'Actions', label: 'Upload bills', hint: 'U' },
              { id: '4', group: 'Actions', label: 'Pay selected bill now' },
              { id: '5', group: 'Demo', label: 'Toggle demo panel' },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: 'shortcuts-sheet',
    group: 'patterns',
    title: 'ShortcutsSheet',
    importPath: '@/ui/patterns/shortcuts-sheet',
    sections: [
      {
        id: 'shortcuts-sheet-matrix',
        title: 'Keyboard map',
        render: () => <ShortcutsSheet />,
      },
    ],
  },
  {
    id: 'demo-control-bar',
    group: 'patterns',
    title: 'DemoControlBar',
    importPath: '@/ui/patterns/demo-control-bar',
    sections: [
      {
        id: 'demo-control-bar-matrix',
        title: 'Collapsed and expanded',
        render: () => (
          <div className="space-y-3">
            <DemoControlBar expanded={false} />
            <DemoControlBar expanded speed="10" warp="60" />
          </div>
        ),
      },
    ],
  },
  {
    id: 'simulate-button',
    group: 'patterns',
    title: 'SimulateButton',
    importPath: '@/ui/patterns/simulate-button',
    sections: [
      {
        id: 'simulate-button-matrix',
        title: 'Idle, each phase, stopped, failed',
        render: () => (
          <div className="space-y-4">
            <Cell label="idle">
              <SimulateButton phase="idle" duration={20} />
            </Cell>
            {SIM_PHASES.map((phase) => (
              <Cell key={phase} label={phase}>
                <SimulateButton phase={phase as SimPhase} eta="12s" />
              </Cell>
            ))}
            <Cell label="aborted">
              <SimulateButton phase="aborted" />
            </Cell>
            <Cell label="failed">
              <SimulateButton phase="failed" error="Quote rejected by Airwallex." />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'settings-form',
    group: 'patterns',
    title: 'SettingsForm',
    importPath: '@/ui/patterns/settings-form',
    sections: [
      {
        id: 'settings-form-matrix',
        title: 'Home currency, lead days, cutoff',
        render: () => <SettingsDemo />,
      },
    ],
  },
];

function SettingsDemo() {
  const [values, setValues] = useState(SETTINGS);
  return <SettingsForm values={values} onChange={setValues} />;
}
