/** Watching bills the 10s poll was sized for. See docs/01 §3.4. */
export const TARGET_WATCHING_BILLS = 50;

/** Requests per second if each bill is polled on its own interval. */
export function pollRequestsPerSecond(
  bills: number,
  pollIntervalMs: number,
): number {
  if (bills < 0 || pollIntervalMs < 1) {
    throw new Error(
      'poll budget needs a non-negative bill count and a positive interval',
    );
  }
  return (bills * 1000) / pollIntervalMs;
}

export function pollFitsBudget(input: {
  bills: number;
  pollIntervalMs: number;
  endpointRps: number;
}): boolean {
  return (
    pollRequestsPerSecond(input.bills, input.pollIntervalMs) <=
    input.endpointRps
  );
}
