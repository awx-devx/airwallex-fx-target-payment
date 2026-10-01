'use client';

import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

export function ScrollArea({
  children,
  orientation = 'vertical',
  className,
}: {
  children: ReactNode;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}) {
  return (
    <ScrollAreaPrimitive.Root className={className ?? 'h-32 w-full'}>
      <ScrollAreaPrimitive.Viewport
        className={orientation === 'horizontal' ? 'w-full' : 'h-full w-full'}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation={orientation}
        className={
          orientation === 'horizontal'
            ? 'flex h-2 touch-none flex-col p-0.5'
            : 'flex w-2 touch-none p-0.5'
        }
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-line-3" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}
