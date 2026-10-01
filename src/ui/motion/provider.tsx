'use client';

import { dur2, easeOut } from '@/ui/tokens/motion';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

type ReducedMotion = 'user' | 'always' | 'never';

/**
 * App-wide Motion settings. `user` follows `prefers-reduced-motion`.
 * The kit toolbar passes `always` when its reduced-motion switch is on.
 */
export function MotionProvider({
  children,
  reducedMotion = 'user',
}: {
  children: ReactNode;
  reducedMotion?: ReducedMotion;
}) {
  return (
    <MotionConfig
      reducedMotion={reducedMotion}
      transition={{ duration: dur2, ease: easeOut }}
    >
      {children}
    </MotionConfig>
  );
}
