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
    <ScrollAreaPrimitive.Root type="scroll" className={className ?? 'h-32 w-full'}>
      <ScrollAreaPrimitive.Viewport
        className={orientation === 'horizontal' ? 'w-full' : 'h-full w-full'}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation={orientation}
        className={
          orientation === 'horizontal'
            ? 'flex h-px touch-none flex-col'
            : 'flex w-px touch-none'
        }
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 bg-orange-500" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}
