'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

export function PopoverPanel({
  children,
  arrow = true,
}: {
  children: ReactNode;
  arrow?: boolean;
}) {
  return (
    <div className="relative w-64 rounded-lg border border-line-2 bg-bg-2 p-3 text-fg-1">
      {children}
      {arrow ? (
        <span
          aria-hidden
          className="absolute -bottom-1 left-6 size-2 rotate-45 border-r border-b border-line-2 bg-bg-2"
        />
      ) : null}
    </div>
  );
}

export function Popover({
  trigger,
  children,
  arrow = true,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  arrow?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={8}
          className="z-50 w-64 rounded-lg border border-line-2 bg-bg-2 p-3 text-fg-1 outline-none"
        >
          {children}
          {arrow ? <PopoverPrimitive.Arrow className="fill-bg-2" /> : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
