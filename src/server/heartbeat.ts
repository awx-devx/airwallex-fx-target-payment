/** Written by the leader worker. Health treats a missing or stale key as down. */
export const HEARTBEAT_KEY = 'worker:heartbeat';
export const HEARTBEAT_MS = 10_000;
export const HEARTBEAT_TTL_MS = 30_000;
