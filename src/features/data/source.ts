import type { DataSource } from '@/contracts/data-source';
import { createApiDataSource } from '@/features/data/api-source';
import { FIXTURE_NOW } from '@/mocks/fixtures/build';
import { WarpClock } from '@/mocks/market/clock';
import { MockDataSource } from '@/mocks/mock-data-source';

let mock: MockDataSource | undefined;
let api: DataSource | undefined;

export function isApiDataSource(): boolean {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === 'api';
}

function getMockSource(): MockDataSource {
  if (!mock) {
    const readRealMs = () => Date.now();
    mock = new MockDataSource({
      clock: new WarpClock(readRealMs, new Date(FIXTURE_NOW)),
      readRealMs,
      marketSeed: 1,
    });
  }
  return mock;
}

/**
 * DEMO-ONLY: one in-browser mock, shared by the terminal and `/dev/market`.
 * PROD: `dataSource()` talks to REST and SSE when `NEXT_PUBLIC_DATA_SOURCE=api`.
 * `Date.now` is the warp clock's real-time reader, not domain time.
 */
export function getDataSource(): MockDataSource {
  return getMockSource();
}

export function dataSource(): DataSource {
  if (isApiDataSource()) {
    api ??= createApiDataSource();
    return api;
  }
  return getMockSource();
}

export function demoControls() {
  if (isApiDataSource()) {
    return {
      setWarp(speed: number) {
        return fetch('/api/demo/clock', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ speed }),
        });
      },
      jumpToDeadline(_billId: string, deadline: string) {
        return fetch('/api/demo/clock', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jumpTo: deadline }),
        });
      },
      nudge(base: string, quote: string) {
        return fetch(`/api/demo/market/${base}${quote}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nudgePips: -20 }),
        });
      },
    };
  }
  const source = getMockSource();
  return {
    setWarp(speed: number) {
      source.setWarp(speed);
    },
    jumpToDeadline(billId: string, _deadline: string) {
      source.jumpToDeadline(billId);
    },
    nudge(base: string, quote: string) {
      source.market.nudge(base, quote, -20);
      source.stepMarket();
    },
  };
}
