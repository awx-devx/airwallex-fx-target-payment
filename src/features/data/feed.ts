import type { AppEvent, FeedKind } from '@/contracts/sse';

export type { FeedKind };
export type FeedHealth = 'live' | 'delayed' | 'offline';
export type FeedConnection = 'live' | 'simulated' | 'delayed' | 'offline';

export interface FeedLabelState {
  feed: FeedKind;
  health: FeedHealth;
}

/** Top-bar label. Simulated means the whole feed is simulated. A tick never changes it. */
export function feedLabel(state: FeedLabelState): FeedConnection {
  if (state.health !== 'live') return state.health;
  return state.feed === 'SIMULATED' ? 'simulated' : 'live';
}

export function noteStreamEvent(state: FeedLabelState, event: AppEvent): FeedLabelState {
  if (event.type === 'hello') return { ...state, feed: event.feed };
  return state;
}

export function noteStreamHealth(state: FeedLabelState, health: FeedHealth): FeedLabelState {
  return { ...state, health };
}
