'use client';

import type { HealthReport } from '@/contracts/health';
import { getDataSource } from '@/features/data/source';
import { AuroraBand } from '@/ui/patterns/grain-aurora';
import { DemoControlBar } from '@/ui/patterns/demo-control-bar';
import { OpsPanel } from '@/ui/patterns/ops-panel';
import { useState } from 'react';

export function MarketRoom({ report }: { report: HealthReport }) {
  const [speed, setSpeed] = useState('1');
  const [warp, setWarp] = useState('1');
  const [log, setLog] = useState<string[]>([]);
  const source =
    process.env.NEXT_PUBLIC_DATA_SOURCE === 'api' ? null : getDataSource();

  function note(line: string) {
    setLog((current) => [line, ...current].slice(0, 12));
  }

  return (
    <div className="relative isolate min-h-dvh bg-bg-0 text-fg-1">
      <AuroraBand freeze={false} />
      <main className="relative z-10 mx-auto max-w-3xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-medium">Market control room</h1>
        <p className="text-fg-2">
          {source
            ? 'Drives the same in-browser simulator as the terminal.'
            : 'In-browser market controls follow the mock data source. Queue and feed status below comes from the server.'}
        </p>
        {source ? (
          <DemoControlBar
            expanded
            speed={speed}
            onSpeedChange={setSpeed}
            warp={warp}
            onWarpChange={(next) => {
              setWarp(next);
              source.setWarp(Number(next));
              note(`Warp ${next}`);
            }}
            onNudge={() => {
              const price = source.market.nudge('EUR', 'USD', -20);
              source.stepMarket();
              note(`EUR/USD nudged to ${price}`);
            }}
            onSimulate={() =>
              note(
                'Select a watching bill in the terminal and use Simulate there.',
              )
            }
            onAdvance={() =>
              note('Advance a transfer from the ticket of an in-flight bill.')
            }
          />
        ) : null}
        <ul className="space-y-1 text-sm text-fg-2">
          {log.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        <OpsPanel report={report} />
      </main>
    </div>
  );
}
