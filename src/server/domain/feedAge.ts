/**
 * A watching or paused bill is stale only after both the last tick and the
 * last write are older than two poll intervals. Arming counts as a write, so
 * a bill that just started watching stays live until the poller misses twice.
 */
export function watchingFeedStale(input: {
  state: string;
  lastTickAt?: string;
  updatedAtMs?: number;
  nowMs: number;
  pollIntervalMs: number;
}): boolean {
  if (input.state !== 'WATCHING' && input.state !== 'PAUSED') return false;
  const limit = 2 * input.pollIntervalMs;
  const tickOld =
    input.lastTickAt === undefined || input.nowMs - Date.parse(input.lastTickAt) > limit;
  const writeOld = input.updatedAtMs === undefined || input.nowMs - input.updatedAtMs > limit;
  return tickOld && writeOld;
}
