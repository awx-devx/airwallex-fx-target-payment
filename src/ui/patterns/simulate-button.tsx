'use client';

import { Button } from '@/ui/primitives/button';
import { Popover } from '@/ui/primitives/popover';
import { Slider } from '@/ui/primitives/slider';
import { Stepper } from '@/ui/primitives/stepper';

export const SIM_PHASES = [
  'ramping',
  'hit',
  'approved',
  'executing',
  'settling',
  'paid',
] as const;

export type SimPhase = (typeof SIM_PHASES)[number] | 'idle' | 'aborted' | 'failed';

const LABEL: Record<(typeof SIM_PHASES)[number], string> = {
  ramping: 'Ramping',
  hit: 'Target hit',
  approved: 'Auto-approved',
  executing: 'Executing',
  settling: 'Settling',
  paid: 'Paid',
};

// DEMO-ONLY: Simulate replays a scripted target hit. PROD: this control does not exist.
export function SimulateButton({
  phase = 'idle',
  duration = 20,
  onDurationChange,
  eta,
  error,
  onStart,
  onStop,
}: {
  phase?: SimPhase;
  duration?: number;
  onDurationChange?: (seconds: number) => void;
  eta?: string;
  error?: string;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const running = phase !== 'idle' && phase !== 'paid' && phase !== 'aborted' && phase !== 'failed';
  const current = SIM_PHASES.indexOf(phase as (typeof SIM_PHASES)[number]);
  if (phase === 'idle') {
    return (
      <Popover
        trigger={<Button size="sm">Simulate target hit</Button>}
      >
        <div className="space-y-2">
          <Slider
            label="Duration"
            min={5}
            max={60}
            step={5}
            value={duration}
            onValueChange={(value) => onDurationChange?.(value)}
          />
          <p className="num text-xs text-fg-2">{duration}s</p>
          <Button size="sm" onClick={onStart}>
            Start
          </Button>
        </div>
      </Popover>
    );
  }
  return (
    <div className="space-y-2">
      <Stepper
        steps={SIM_PHASES.map((item) => ({
          label: LABEL[item],
          state:
            phase === 'failed' || phase === 'aborted'
              ? item === 'ramping'
                ? 'error'
                : 'upcoming'
              : current > SIM_PHASES.indexOf(item)
                ? 'complete'
                : current === SIM_PHASES.indexOf(item)
                  ? 'current'
                  : 'upcoming',
        }))}
      />
      {eta && running ? <p className="text-xs text-fg-2">ETA {eta}</p> : null}
      {phase === 'failed' ? <p className="text-xs text-down">{error ?? 'The simulation failed.'}</p> : null}
      {phase === 'aborted' ? <p className="text-xs text-fg-3">Stopped.</p> : null}
      {phase === 'paid' ? <p className="text-xs text-up">Paid</p> : null}
      {running ? (
        <Button size="sm" variant="secondary" onClick={onStop}>
          Stop
        </Button>
      ) : null}
    </div>
  );
}
