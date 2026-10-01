'use client';

import { DropdownMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

const ITEM =
  'flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left outline-none data-[highlighted]:bg-bg-3 data-[disabled]:opacity-40';

export function Menu({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          className="z-50 min-w-48 rounded-md border border-line-2 bg-bg-2 p-1 shadow-[var(--shadow-panel)]"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  icon,
  shortcut,
  destructive = false,
  disabled = false,
  onSelect,
}: {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cx(ITEM, destructive ? 'text-down' : 'text-fg-1')}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut ? <span className="text-fg-3">{shortcut}</span> : null}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line-2" />;
}

export function MenuSub({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={ITEM}>
        {label}
        <span className="ml-auto text-fg-3">›</span>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className="z-50 min-w-40 rounded-md border border-line-2 bg-bg-2 p-1 shadow-[var(--shadow-panel)]">
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/** Static menu body for the kit matrix. The live menu uses the same classes. */
export function MenuPreview({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-48 rounded-md border border-line-2 bg-bg-2 p-1 shadow-[var(--shadow-panel)]">
      {children}
    </div>
  );
}

export function MenuPreviewItem({
  children,
  icon,
  shortcut,
  destructive = false,
}: {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
}) {
  return (
    <div className={cx(ITEM, destructive ? 'text-down' : 'text-fg-1')}>
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut ? <span className="text-fg-3">{shortcut}</span> : null}
    </div>
  );
}
