'use client';

import { useState } from 'react';
import { Button } from '@/ui/primitives/button';
import { SegmentedControl } from '@/ui/primitives/segmented';

// DEMO-ONLY: the floating bar drives the simulated market and clock.
// PROD: there is no demo control bar.
export function DemoControlBar({
  expanded = false,
  onExpandedChange,
  speed = '1',
  onSpeedChange,
  warp = '1',
  onWarpChange,
  onNudge,
  onJump,
  onAdvance,
  onSimulate,
}: {
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  speed?: string;
  onSpeedChange?: (speed: string) => void;
  warp?: string;
  onWarpChange?: (warp: string) => void;
  onNudge?: () => void;
  onJump?: () => void;
  onAdvance?: () => void;
  onSimulate?: () => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-orange-500/40 bg-bg-1 px-2 py-1.5">
      <Button size="sm" variant="ghost" onClick={() => onExpandedChange?.(!expanded)}>
        {expanded ? 'Hide demo' : 'Demo'}
      </Button>
      {expanded ? (
        <>
          <SegmentedControl
            label="Market speed"
            size="sm"
            value={speed}
            onValueChange={(next) => onSpeedChange?.(next)}
            options={[
              { value: '1', label: '1×' },
              { value: '10', label: '10×' },
              { value: '60', label: '60×' },
            ]}
          />
          <SegmentedControl
            label="Time warp"
            size="sm"
            value={warp}
            onValueChange={(next) => onWarpChange?.(next)}
            options={[
              { value: '1', label: 'Now' },
              { value: '60', label: '1h' },
              { value: '1440', label: '1d' },
            ]}
          />
          <Button size="sm" variant="secondary" onClick={onNudge}>
            Nudge price
          </Button>
          <Button size="sm" variant="secondary" onClick={onJump}>
            Jump to deadline
          </Button>
          <Button size="sm" variant="secondary" onClick={onAdvance}>
            Advance transfer
          </Button>
          <Button size="sm" onClick={onSimulate}>
            Simulate selected bill
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function DemoControlDemo() {
  const [expanded, setExpanded] = useState(true);
  const [speed, setSpeed] = useState('1');
  const [warp, setWarp] = useState('1');
  return (
    <DemoControlBar
      expanded={expanded}
      onExpandedChange={setExpanded}
      speed={speed}
      onSpeedChange={setSpeed}
      warp={warp}
      onWarpChange={setWarp}
    />
  );
}
