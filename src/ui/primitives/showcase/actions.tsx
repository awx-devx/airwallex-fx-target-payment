'use client';

import { Check, Plus, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
  type ForcedState,
} from '@/ui/primitives/button';
import { IconButton } from '@/ui/primitives/icon-button';
import { Kbd } from '@/ui/primitives/kbd';
import { ButtonGroup, SegmentedControl } from '@/ui/primitives/segmented';
import { Cell, Matrix } from '@/ui/primitives/showcase/frame';

const VARIANTS: ButtonVariant[] = [
  'primary',
  'secondary',
  'ghost',
  'outline',
  'danger',
  'success',
  'link',
];
const SIZES: ButtonSize[] = ['xs', 'sm', 'md', 'lg'];
const FORCED: ForcedState[] = ['hover', 'active', 'focus'];

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-3.5 items-center justify-center">
      {children}
    </span>
  );
}

const buttonShowcase: Showcase = {
  id: 'button',
  group: 'primitives',
  title: 'Button',
  importPath: '@/ui/primitives/button',
  sections: [
    {
      id: 'button-variants',
      title: 'Variants',
      render: () => (
        <Matrix>
          {VARIANTS.map((variant) => (
            <Cell key={variant} label={variant}>
              <Button variant={variant}>Pay bill</Button>
            </Cell>
          ))}
        </Matrix>
      ),
    },
    {
      id: 'button-sizes',
      title: 'Sizes',
      render: () => (
        <Matrix>
          {SIZES.map((size) => (
            <Cell key={size} label={size}>
              <Button size={size}>Pay bill</Button>
            </Cell>
          ))}
        </Matrix>
      ),
    },
    {
      id: 'button-states',
      title: 'States',
      render: () => (
        <Matrix>
          {FORCED.map((forced) => (
            <Cell key={forced} label={forced}>
              <Button forced={forced}>Pay bill</Button>
            </Cell>
          ))}
          <Cell label="disabled">
            <Button disabled>Pay bill</Button>
          </Cell>
          <Cell label="loading">
            <Button loading>Pay bill</Button>
          </Cell>
        </Matrix>
      ),
    },
    {
      id: 'button-icons',
      title: 'Icons and hint',
      render: () => (
        <Matrix>
          <Cell label="left icon">
            <Button icon={<Icon><Plus strokeWidth={1.5} className="size-3.5" /></Icon>}>
              Add
            </Button>
          </Cell>
          <Cell label="right icon">
            <Button
              variant="secondary"
              iconRight={<Icon><Check strokeWidth={1.5} className="size-3.5" /></Icon>}
            >
              Confirm
            </Button>
          </Cell>
          <Cell label="icon only">
            <Button aria-label="Search" icon={<Search strokeWidth={1.5} className="size-3.5" />} />
          </Cell>
          <Cell label="kbd hint">
            <Button variant="secondary" iconRight={<Kbd size="xs">{['⌘', 'K']}</Kbd>}>
              Command
            </Button>
          </Cell>
        </Matrix>
      ),
    },
  ],
};

const iconButtonShowcase: Showcase = {
  id: 'icon-button',
  group: 'primitives',
  title: 'IconButton',
  importPath: '@/ui/primitives/icon-button',
  sections: [
    {
      id: 'icon-button-matrix',
      title: 'Variants, sizes, tooltip, badge',
      render: () => (
        <Matrix>
          {(['ghost', 'secondary', 'primary'] as const).map((variant) =>
            (['xs', 'sm', 'md'] as const).map((size) => (
              <Cell key={`${variant}-${size}`} label={`${variant} ${size}`}>
                <IconButton label={`${variant} ${size}`} variant={variant} size={size}>
                  <Search strokeWidth={1.5} className="size-3.5" />
                </IconButton>
              </Cell>
            )),
          )}
          <Cell label="tooltip">
            <IconButton label="Search" tooltip="Search bills">
              <Search strokeWidth={1.5} className="size-3.5" />
            </IconButton>
          </Cell>
          <Cell label="badge">
            <IconButton label="Alerts" badge>
              <Search strokeWidth={1.5} className="size-3.5" />
            </IconButton>
          </Cell>
        </Matrix>
      ),
    },
  ],
};

function SegmentedDemo() {
  const [pill, setPill] = useState('rate');
  const [line, setLine] = useState('open');
  return (
    <div className="space-y-4">
      <Matrix>
        {(['sm', 'md'] as const).map((size) => (
          <Cell key={size} label={`pill ${size}`}>
            <SegmentedControl
              label={`Mode ${size}`}
              size={size}
              value={pill}
              onValueChange={setPill}
              options={[
                { value: 'rate', label: 'Target rate' },
                { value: 'cost', label: 'Max cost' },
                { value: 'off', label: 'Off', disabled: true },
              ]}
            />
          </Cell>
        ))}
      </Matrix>
      <Cell label="underline md">
        <SegmentedControl
          label="Book"
          variant="underline"
          value={line}
          onValueChange={setLine}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'settled', label: 'Settled' },
            { value: 'void', label: 'Void', disabled: true },
          ]}
        />
      </Cell>
      <Cell label="button group">
        <ButtonGroup label="Density">
          <Button variant="ghost" size="sm">
            Compact
          </Button>
          <Button variant="secondary" size="sm">
            Comfortable
          </Button>
          <Button variant="ghost" size="sm" disabled>
            Sparse
          </Button>
        </ButtonGroup>
      </Cell>
    </div>
  );
}

const segmentedShowcase: Showcase = {
  id: 'segmented',
  group: 'primitives',
  title: 'SegmentedControl and ButtonGroup',
  importPath: '@/ui/primitives/segmented',
  sections: [
    {
      id: 'segmented-matrix',
      title: 'Pill, underline, disabled item',
      render: () => <SegmentedDemo />,
    },
  ],
};

const kbdShowcase: Showcase = {
  id: 'kbd',
  group: 'primitives',
  title: 'Kbd',
  importPath: '@/ui/primitives/kbd',
  sections: [
    {
      id: 'kbd-matrix',
      title: 'Single and combo',
      render: () => (
        <Matrix>
          <Cell label="xs">
            <Kbd size="xs">K</Kbd>
          </Cell>
          <Cell label="sm">
            <Kbd>Enter</Kbd>
          </Cell>
          <Cell label="combo xs">
            <Kbd size="xs">{['⌘', 'K']}</Kbd>
          </Cell>
          <Cell label="combo sm">
            <Kbd>{['⇧', '⌘', 'P']}</Kbd>
          </Cell>
        </Matrix>
      ),
    },
  ],
};

export const actionShowcases: Showcase[] = [
  buttonShowcase,
  iconButtonShowcase,
  segmentedShowcase,
  kbdShowcase,
];
