'use client';

import { useState } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import { Badge } from '@/ui/primitives/badge';
import { Card } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/primitives/empty-state';
import { ScrollArea } from '@/ui/primitives/scroll-area';
import { LoadingRows, Table, Td, Th, Tr } from '@/ui/primitives/table';
import { Tabs } from '@/ui/primitives/tabs';
import { Cell } from '@/ui/primitives/showcase/frame';

const ROWS = [
  ['Helios GmbH', 'EUR', '12,400.00'],
  ['Kite Ltd', 'GBP', '8,200.00'],
  ['Northwind', 'USD', '3,150.00'],
  ['Sakura Co', 'JPY', '1,240,000'],
  ['Nile Trading', 'KES', '980,000'],
  ['Atlas SARL', 'EUR', '4,400.00'],
];

function TabDemo({
  variant,
  size,
}: {
  variant: 'underline' | 'pill';
  size: 'sm' | 'md';
}) {
  const [value, setValue] = useState('open');
  return (
    <Tabs
      variant={variant}
      size={size}
      value={value}
      onValueChange={setValue}
      tabs={[
        { value: 'open', label: 'Open', count: 4, content: <p>Four bills are still armed.</p> },
        { value: 'settled', label: 'Settled', content: <p>Paid before the deadline.</p> },
        {
          value: 'void',
          label: 'Void',
          disabled: true,
          content: <p>Unavailable.</p>,
        },
      ]}
    />
  );
}

function BillTable() {
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const rows = [...ROWS].sort((a, b) =>
    sort === 'asc' ? a[0]!.localeCompare(b[0]!) : b[0]!.localeCompare(a[0]!),
  );
  return (
    <Table label="Bills" className="max-h-40">
      <thead>
        <tr>
          <Th sortable sorted={sort} onSort={() => setSort(sort === 'asc' ? 'desc' : 'asc')} sticky>
            Vendor
          </Th>
          <Th sticky>Currency</Th>
          <Th sticky>Amount</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <Tr key={row[0]} selected={index === 1}>
            <Td>{row[0]}</Td>
            <Td>{row[1]}</Td>
            <Td>
              <span className="num">{row[2]}</span>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export const layoutShowcases: Showcase[] = [
  {
    id: 'tabs',
    group: 'primitives',
    title: 'Tabs',
    importPath: '@/ui/primitives/tabs',
    sections: [
      {
        id: 'tabs-matrix',
        title: 'Underline, pill, count, disabled',
        render: () => (
          <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
            <Cell label="underline md">
              <TabDemo variant="underline" size="md" />
            </Cell>
            <Cell label="pill sm">
              <TabDemo variant="pill" size="sm" />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'card',
    group: 'primitives',
    title: 'Card',
    importPath: '@/ui/primitives/card',
    sections: [
      {
        id: 'card-matrix',
        title: 'Flat, raised, glow border, selected',
        render: () => (
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <Card>
              <p className="font-medium">Flat</p>
              <p className="text-fg-2">Default panel.</p>
            </Card>
            <Card variant="raised">
              <p className="font-medium">Raised</p>
              <p className="text-fg-2">Sits above the page.</p>
            </Card>
            <Card variant="glow-border">
              <p className="font-medium">Glow border</p>
              <p className="text-fg-2">Masked gradient edge.</p>
            </Card>
            <Card interactive selected>
              <p className="font-medium">Selected</p>
              <p className="text-fg-2">Orange wash and glow.</p>
            </Card>
          </div>
        ),
      },
    ],
  },
  {
    id: 'scroll-area',
    group: 'primitives',
    title: 'ScrollArea',
    importPath: '@/ui/primitives/scroll-area',
    sections: [
      {
        id: 'scroll-area-matrix',
        title: 'Vertical and horizontal',
        render: () => (
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Cell label="vertical">
              <ScrollArea className="h-28 rounded-sm border border-line-1">
                <div className="space-y-2 p-3">
                  {ROWS.map((row) => (
                    <p key={row[0]}>
                      {row[0]} · {row[1]}
                    </p>
                  ))}
                </div>
              </ScrollArea>
            </Cell>
            <Cell label="horizontal">
              <ScrollArea orientation="horizontal" className="h-16 w-full">
                <div className="flex w-[640px] gap-2 p-3">
                  {['EUR', 'USD', 'GBP', 'JPY', 'KES', 'BHD', 'SGD', 'AUD'].map((code) => (
                    <Badge key={code}>{code}</Badge>
                  ))}
                </div>
              </ScrollArea>
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'table',
    group: 'primitives',
    title: 'Table',
    importPath: '@/ui/primitives/table',
    sections: [
      {
        id: 'table-matrix',
        title: 'Sticky header, sort, selected row, loading, empty',
        render: () => (
          <div className="grid max-w-3xl gap-4">
            <BillTable />
            <Table label="Loading bills">
              <thead>
                <tr>
                  <Th>Vendor</Th>
                  <Th>Currency</Th>
                  <Th>Amount</Th>
                </tr>
              </thead>
              <LoadingRows columns={3} />
            </Table>
            <Table label="Empty bills">
              <thead>
                <tr>
                  <Th>Vendor</Th>
                  <Th>Currency</Th>
                  <Th>Amount</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3}>
                    <EmptyState title="No bills" body="Upload an invoice to start a position." />
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        ),
      },
    ],
  },
];
