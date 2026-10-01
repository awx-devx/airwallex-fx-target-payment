'use client';

import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function TooltipCard({
  content,
  title,
}: {
  content: ReactNode;
  title?: ReactNode;
}) {
  return (
    <div className="max-w-xs rounded-lg border border-line-2 bg-bg-2 px-2 py-1.5 text-fg-1">
      {title ? <p className="font-medium">{title}</p> : null}
      <p className={title ? 'text-fg-2' : undefined}>{content}</p>
    </div>
  );
}

export function Tooltip({
  content,
  title,
  delay,
  arrow = true,
  children,
}: {
  content: ReactNode;
  title?: ReactNode;
  delay?: number;
  arrow?: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className={cx(
            'z-50 max-w-xs rounded-lg border border-line-2 bg-bg-2 px-2 py-1.5 text-fg-1',
            'data-[state=delayed-open]:animate-none',
          )}
        >
          {title ? <p className="font-medium">{title}</p> : null}
          <p className={title ? 'text-fg-2' : undefined}>{content}</p>
          {arrow ? (
            <TooltipPrimitive.Arrow className="fill-bg-2" />
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
