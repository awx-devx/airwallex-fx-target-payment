'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import { Badge } from '@/ui/primitives/badge';

export function Tabs({
  value,
  onValueChange,
  tabs,
  variant = 'underline',
  size = 'md',
  listClassName,
  fill = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  tabs: ReadonlyArray<{
    value: string;
    label: string;
    count?: number;
    disabled?: boolean;
    content: ReactNode;
  }>;
  variant?: 'underline' | 'pill';
  size?: 'sm' | 'md';
  listClassName?: string;
  /** Stretch the active pane to the parent height so switching tabs does not resize the chart. */
  fill?: boolean;
}) {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      className={fill ? 'flex h-full min-h-0 flex-1 flex-col' : undefined}
    >
      <TabsPrimitive.List
        className={cx(
          'flex shrink-0',
          variant === 'pill'
            ? 'gap-1 rounded-sm border border-line-2 bg-bg-1 p-0.5'
            : 'gap-4 border-b border-line-1',
          listClassName,
        )}
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={cx(
              'inline-flex items-center gap-1.5 font-medium outline-none',
              'focus-visible:shadow-[var(--glow-sm)] disabled:opacity-40',
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
              variant === 'underline'
                ? '-mb-px border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-fg-1 text-fg-3'
                : 'rounded-xs px-2 data-[state=active]:bg-bg-3 data-[state=active]:text-fg-1 text-fg-3',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <Badge size="xs" tone="orange">
                {tab.count}
              </Badge>
            ) : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content
          key={tab.value}
          value={tab.value}
          className={fill ? 'min-h-0 flex-1 overflow-auto outline-none' : 'pt-3 outline-none'}
        >
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
