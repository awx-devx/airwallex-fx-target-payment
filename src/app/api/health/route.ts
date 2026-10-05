import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { collectHealth } from '@/server/services/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const report = await collectHealth({
      env: getEnv(),
      clock: new SystemClock(),
    });
    return json(report, report.ok ? 200 : 503);
  } catch (error) {
    return failureResponse(error);
  }
}
