'use client';

import { useReducedMotion } from 'motion/react';
import { ThinkingOrb } from 'thinking-orbs';
import type { ExtractionStage } from '@/ui/primitives/file-dropzone';

const LABEL: Record<ExtractionStage, string> = {
  working: 'Queued',
  searching: 'Reading the file',
  solving: 'Reading with the model',
};

/**
 * Extraction progress. Size 20 sits in a file row. Size 64 is the extraction
 * screen. The orb pauses under reduced motion and the stage label stays.
 */
export function ExtractionOrb({
  state,
  size = 20,
}: {
  state: ExtractionStage;
  size?: 20 | 64;
}) {
  const reduced = useReducedMotion();
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <ThinkingOrb
        state={state}
        size={size}
        theme="dark"
        speed={1}
        paused={reduced === true}
        aria-label={LABEL[state]}
      />
      <span className="text-xs text-fg-2">{LABEL[state]}</span>
    </span>
  );
}
