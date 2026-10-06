export const SIMULATION_OUTCOMES = ['RUNNING', 'TRIGGERED', 'ABORTED'] as const;
export type SimulationOutcome = (typeof SIMULATION_OUTCOMES)[number];

/** A running or triggered Simulate stays on that bill. Stop (ABORTED) returns it to the shared feed. */
export function showsSimulated(outcome: SimulationOutcome | undefined): boolean {
  return outcome === 'RUNNING' || outcome === 'TRIGGERED';
}
