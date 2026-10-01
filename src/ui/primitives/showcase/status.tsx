'use client';

import type { Showcase } from '@/ui/showcase/types';
import { Avatar } from '@/ui/primitives/avatar';
import { Badge, type BadgeStyle, type BadgeTone } from '@/ui/primitives/badge';
import { Chip } from '@/ui/primitives/chip';
import { Divider } from '@/ui/primitives/divider';
import { ProgressBar } from '@/ui/primitives/progress';
import { Skeleton } from '@/ui/primitives/skeleton';
import { Spinner } from '@/ui/primitives/spinner';
import { Cell, Matrix } from '@/ui/primitives/showcase/frame';
import { useState } from 'react';

const TONES: BadgeTone[] = ['neutral', 'orange', 'up', 'down', 'warn', 'info', 'muted'];
const LOOKS: BadgeStyle[] = ['soft', 'solid', 'outline'];

const PORTRAIT =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%232a241c'/><circle cx='16' cy='13' r='6' fill='%23ffb15a'/><rect x='6' y='22' width='20' height='10' rx='5' fill='%23ffb15a'/></svg>";

function Badges() {
  return (
    <div className="space-y-4">
      {LOOKS.map((appearance) => (
        <Matrix key={appearance}>
          {TONES.map((tone) => (
            <Cell key={`${appearance}-${tone}`} label={`${appearance} ${tone}`}>
              <Badge appearance={appearance} tone={tone} size="sm">
                {tone}
              </Badge>
            </Cell>
          ))}
        </Matrix>
      ))}
      <Matrix>
        <Cell label="xs">
          <Badge size="xs" tone="orange">
            xs
          </Badge>
        </Cell>
        <Cell label="dot">
          <Badge tone="up" dot>
            Live
          </Badge>
        </Cell>
        <Cell label="pulse dot">
          <Badge tone="orange" dot pulse>
            Watching
          </Badge>
        </Cell>
      </Matrix>
    </div>
  );
}

function Chips() {
  const [gone, setGone] = useState(false);
  const [selected, setSelected] = useState(true);
  return (
    <Matrix>
      <Cell label="filter">
        <Chip onClick={() => setSelected((current) => !current)} selected={selected}>
          EUR
        </Chip>
      </Cell>
      <Cell label="selected">
        <Chip selected>Due this week</Chip>
      </Cell>
      <Cell label="removable">
        {gone ? (
          <Chip onClick={() => setGone(false)}>Restore USD</Chip>
        ) : (
          <Chip onRemove={() => setGone(true)}>USD</Chip>
        )}
      </Cell>
    </Matrix>
  );
}

export const statusShowcases: Showcase[] = [
  {
    id: 'badge',
    group: 'primitives',
    title: 'Badge',
    importPath: '@/ui/primitives/badge',
    sections: [{ id: 'badge-matrix', title: 'Tone, appearance, dot', render: () => <Badges /> }],
  },
  {
    id: 'chip',
    group: 'primitives',
    title: 'Chip',
    importPath: '@/ui/primitives/chip',
    sections: [{ id: 'chip-matrix', title: 'Filter and removable', render: () => <Chips /> }],
  },
  {
    id: 'avatar',
    group: 'primitives',
    title: 'Avatar',
    importPath: '@/ui/primitives/avatar',
    sections: [
      {
        id: 'avatar-matrix',
        title: 'Initials, image, approver ring',
        render: () => (
          <Matrix>
            <Cell label="initials xs">
              <Avatar name="Ada Lovelace" size="xs" />
            </Cell>
            <Cell label="initials sm">
              <Avatar name="Ada Lovelace" />
            </Cell>
            <Cell label="image">
              <Avatar name="Ada Lovelace" src={PORTRAIT} />
            </Cell>
            <Cell label="approver">
              <Avatar name="Grace Hopper" approver />
            </Cell>
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'spinner',
    group: 'primitives',
    title: 'Spinner',
    importPath: '@/ui/primitives/spinner',
    sections: [
      {
        id: 'spinner-matrix',
        title: 'Ring and dots',
        render: () => (
          <Matrix>
            {(['xs', 'sm', 'md'] as const).map((size) => (
              <Cell key={size} label={`ring ${size}`}>
                <Spinner size={size} />
              </Cell>
            ))}
            {(['xs', 'sm', 'md'] as const).map((size) => (
              <Cell key={`dots-${size}`} label={`dots ${size}`}>
                <Spinner variant="dots" size={size} />
              </Cell>
            ))}
          </Matrix>
        ),
      },
    ],
  },
  {
    id: 'skeleton',
    group: 'primitives',
    title: 'Skeleton',
    importPath: '@/ui/primitives/skeleton',
    sections: [
      {
        id: 'skeleton-matrix',
        title: 'Line, block, circle, chart',
        render: () => (
          <div className="grid max-w-md gap-3">
            <Skeleton />
            <Skeleton variant="block" />
            <Skeleton variant="circle" />
            <Skeleton variant="chart" />
          </div>
        ),
      },
    ],
  },
  {
    id: 'progress',
    group: 'primitives',
    title: 'ProgressBar',
    importPath: '@/ui/primitives/progress',
    sections: [
      {
        id: 'progress-matrix',
        title: 'Determinate, indeterminate, steps',
        render: () => (
          <div className="grid max-w-md gap-4">
            <Cell label="orange">
              <ProgressBar value={60} label="Quote" />
            </Cell>
            <Cell label="up">
              <ProgressBar value={80} tone="up" label="Paid" />
            </Cell>
            <Cell label="warn">
              <ProgressBar value={40} tone="warn" label="Deadline" />
            </Cell>
            <Cell label="indeterminate">
              <ProgressBar indeterminate label="Loading" />
            </Cell>
            <Cell label="segmented">
              <ProgressBar
                label="Steps"
                segments={[{ done: true }, { done: true }, { done: false }, { done: false }]}
              />
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'divider',
    group: 'primitives',
    title: 'Divider',
    importPath: '@/ui/primitives/divider',
    sections: [
      {
        id: 'divider-matrix',
        title: 'Horizontal, vertical, label',
        render: () => (
          <div className="max-w-md space-y-4">
            <Divider />
            <Divider label="or" />
            <div className="flex h-8 items-center gap-3">
              <span>LOCAL</span>
              <Divider orientation="vertical" />
              <span>SWIFT</span>
            </div>
          </div>
        ),
      },
    ],
  },
];
