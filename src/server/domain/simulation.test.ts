import { describe, expect, it } from 'vitest';
import { showsSimulated, type SimulationOutcome } from '@/server/domain/simulation';

describe('showsSimulated', () => {
  it('keeps a running or triggered bill on the simulated label', () => {
    const cases: { outcome: SimulationOutcome | undefined; simulated: boolean }[] = [
      { outcome: 'RUNNING', simulated: true },
      { outcome: 'TRIGGERED', simulated: true },
      { outcome: 'ABORTED', simulated: false },
      { outcome: undefined, simulated: false },
    ];
    for (const item of cases) {
      expect(showsSimulated(item.outcome)).toBe(item.simulated);
    }
  });
});
