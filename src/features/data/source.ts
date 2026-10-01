import type { DataSource } from '@/contracts/data-source';
import { FIXTURE_NOW } from '@/mocks/fixtures/build';
import { WarpClock } from '@/mocks/market/clock';
import { MockDataSource } from '@/mocks/mock-data-source';

let source: MockDataSource | undefined;

/**
 * DEMO-ONLY: one in-browser mock, shared by the terminal and `/dev/market`.
 * PROD: `api` DataSource talks to REST and SSE. `Date.now` is the warp clock's
 * real-time reader, not domain time.
 */
export function getDataSource(): MockDataSource {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === 'api') {
    throw new Error('The api DataSource is U7');
  }
  if (!source) {
    const readRealMs = () => Date.now();
    source = new MockDataSource({
      clock: new WarpClock(readRealMs, new Date(FIXTURE_NOW)),
      readRealMs,
      marketSeed: 1,
    });
  }
  return source;
}

export function dataSource(): DataSource {
  return getDataSource();
}
