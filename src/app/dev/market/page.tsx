import { notFound } from 'next/navigation';
import { MarketRoom } from '@/app/dev/market/room';
import { SystemClock } from '@/server/adapters/clock';
import { demoRoutesEnabled } from '@/server/demo/gate';
import { getEnv } from '@/server/env';
import { collectHealth } from '@/server/services/health';

export default async function MarketPage() {
  if (!demoRoutesEnabled()) notFound();
  const report = await collectHealth({
    env: getEnv(),
    clock: new SystemClock(),
  });
  return <MarketRoom report={report} />;
}
