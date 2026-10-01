'use client';

import { GrainGradient } from '@paper-design/shaders-react';
import { useReducedMotion } from 'motion/react';

/**
 * Bottom grain pool. Paper shaders take hex strings, not CSS variables;
 * these stops are the ones in docs/05 §2.
 * Grain already scales time by 0.1, so speed 1 is the slow drift.
 */
const BAND =
  'pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[40vh] [mask-image:linear-gradient(to_top,#000,transparent)]';

export function AuroraBand({ freeze }: { freeze: boolean }) {
  const reduced = useReducedMotion();
  const paused = freeze || reduced === true;
  return (
    <div className={BAND} aria-hidden>
      <GrainGradient
        colorBack="#07070A"
        colors={['#1C1240', '#3A2214']}
        shape="wave"
        softness={0.95}
        intensity={0.12}
        noise={0.08}
        scale={1.4}
        offsetY={-0.35}
        speed={paused ? 0 : 1}
        minPixelRatio={1}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
